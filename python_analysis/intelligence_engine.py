import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd
from datetime import datetime, timedelta
import json
import os

def run_analysis(project_id='anjaniappnew', test_mode=True):
    # Initialize Firebase
    if not firebase_admin._apps:
        try:
            # Try Application Default Credentials first
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred, {
                'projectId': project_id,
            })
        except Exception:
            # Fallback for local environments without default creds
            firebase_admin.initialize_app(options={'projectId': project_id})
    
    db = firestore.client()
    
    print("Fetching comprehensive data from Firestore...")
    
    # Fetch Orders
    orders_ref = db.collection('orders')
    orders_list = [doc.to_dict() | {'id': doc.id} for doc in orders_ref.stream()]
    
    # Fetch Clients/Customers
    clients_ref = db.collection('customers')
    clients_list = [doc.to_dict() | {'id': doc.id} for doc in clients_ref.stream()]
        
    if not orders_list and test_mode:
        print("No orders found. Generating mock data for demonstration...")
        # Mock data logic if empty
        orders_list = [
            {'clientName': 'Jigneshbhai', 'qty': 150, 'rate': 12, 'date': (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d'), 'status': 'Delivered'},
            {'clientName': 'Jigneshbhai', 'qty': 100, 'rate': 12, 'date': (datetime.now() - timedelta(days=12)).strftime('%Y-%m-%d'), 'status': 'Delivered'},
            {'clientName': 'KiaMotors', 'qty': 80, 'rate': 15, 'date': (datetime.now() - timedelta(days=5)).strftime('%Y-%m-%d'), 'status': 'Delivered'},
            {'clientName': 'KiaMotors', 'qty': 80, 'rate': 15, 'date': (datetime.now() - timedelta(days=15)).strftime('%Y-%m-%d'), 'status': 'Pending'},
            {'clientName': 'Reliance', 'qty': 500, 'rate': 10, 'date': (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'), 'status': 'Delivered'},
        ]

    if not orders_list:
        print("Error: No data to analyze.")
        return

    df = pd.DataFrame(orders_list)
    
    # Preprocessing
    # Handle different date formats (string or timestamp)
    df['date_dt'] = pd.to_datetime(df['date'], errors='coerce').dt.tz_localize(None)
    df['amount'] = pd.to_numeric(df['qty'], errors='coerce') * pd.to_numeric(df['rate'], errors='coerce')
    df['status_norm'] = df['status'].str.strip().str.lower().fillna('pending')
    
    # Filter for revenue (Delivered or Completed)
    df_delivered = df[df['status_norm'].isin(['delivered', 'completed'])]
    
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    # --- SALES ANALYTICS (KPIs) ---
    def get_period_stats(df_period, start_date):
        period_df = df_period[df_period['date_dt'] >= start_date]
        return {
            'revenue': float(period_df['amount'].sum()),
            'count': int(len(period_df))
        }

    sales_stats = {
        'today': get_period_stats(df_delivered, today_start),
        'week': get_period_stats(df_delivered, week_start),
        'month': get_period_stats(df_delivered, month_start),
        'pending': int(len(df[~df['status_norm'].isin(['delivered', 'completed', 'cancelled'])]))
    }

    # --- DRILL-DOWN DATA ---
    today_delivered_list = df_delivered[df_delivered['date_dt'] >= today_start].to_dict(orient='records')
    # Filter for clean pending orders
    pending_list = df[~df['status_norm'].isin(['delivered', 'completed', 'cancelled'])].sort_values('date_dt', ascending=False).head(20).to_dict(orient='records')
    
    # Outstanding List
    outstanding_clients = [
        {
            "name": c.get('name', 'Unnamed'),
            "outstanding": float(c.get('outstanding', 0)),
            "mobile": c.get('mobile', '')
        }
        for c in clients_list if float(c.get('outstanding', 0)) > 0
    ]
    outstanding_clients = sorted(outstanding_clients, key=lambda x: x['outstanding'], reverse=True)
    total_outstanding = sum(c['outstanding'] for c in outstanding_clients)

    # Top Customers (Monthly)
    top_cust_df = df_delivered[df_delivered['date_dt'] >= month_start]
    if not top_cust_df.empty:
        top_cust = top_cust_df.groupby('clientName')['amount'].sum().sort_values(ascending=False).head(5)
        top_customers = [{"name": name, "revenue": float(amt)} for name, amt in top_cust.items()]
    else:
        top_customers = []

    # --- RFM CALCULATION ---
    rfm = df.groupby('clientName').agg({
        'date_dt': lambda x: (now - x.max()).days,
        'amount': 'sum',
        'id': 'count'
    }).rename(columns={'date_dt': 'recency', 'id': 'frequency', 'amount': 'monetary'})
    
    # --- REFILL PREDICTION ---
    refill_alerts = []
    for name, group in df.sort_values('date_dt').groupby('clientName'):
        if len(group) > 1:
            intervals = group['date_dt'].diff().dt.days.dropna()
            avg_interval = intervals.mean()
            if avg_interval > 0:
                last_order = group['date_dt'].max()
                predicted_next = last_order + timedelta(days=avg_interval)
                days_until = (predicted_next - now).days
                if -3 <= days_until <= 3:
                    refill_alerts.append({
                        'name': name,
                        'avgInterval': round(avg_interval, 1),
                        'lastOrder': last_order.strftime('%Y-%m-%d'),
                        'predictedDate': predicted_next.strftime('%Y-%m-%d'),
                        'urgency': 'High' if days_until <= 0 else 'Medium'
                    })

    # --- SEGMENTATION LOGIC ---
    def segment_customer(row):
        if row['recency'] <= 7 and row['frequency'] >= 2:
            return 'Champion'
        if row['recency'] > 20:
            return 'At Risk'
        if row['frequency'] <= 1:
            return 'New'
        return 'Regular'

    rfm['segment'] = rfm.apply(segment_customer, axis=1)
    
    # --- PREPARE REPORT ---
    report = {
        'timestamp': firestore.SERVER_TIMESTAMP,
        'sales': sales_stats,
        'topCustomers': top_customers,
        'totalOutstanding': float(total_outstanding),
        'drillDown': {
            'todayDelivered': today_delivered_list,
            'pending': pending_list,
            'outstanding': outstanding_clients[:50] # Top 50 outstanding
        },
        'summary': {
            'totalRevenue': float(df_delivered['amount'].sum()),
            'activeCustomers': int(len(rfm)),
            'champions': int(len(rfm[rfm['segment'] == 'Champion'])),
            'atRisk': int(len(rfm[rfm['segment'] == 'At Risk']))
        },
        'refillAlerts': sorted(refill_alerts, key=lambda x: x['urgency'] == 'High', reverse=True),
        'customerSegments': rfm.reset_index().to_dict(orient='records'),
        'forecast': {
            'next7DaysEstimate': float(rfm['monetary'].sum() / 30 * 7) # Simplified projection
        }
    }
    
    # Write to Firestore
    print("Writing intelligence report to Firestore...")
    db.collection('intelligence_reports').add(report)
    print("Analysis complete!")

if __name__ == "__main__":
    run_analysis()
