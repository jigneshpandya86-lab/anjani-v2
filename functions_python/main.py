# The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
from firebase_functions import https_fn, options

# The Firebase Admin SDK to access Cloud Firestore.
from firebase_admin import initialize_app, firestore
import pandas as pd
from datetime import datetime, timedelta
import pytz

initialize_app()

def get_ist_now():
    """Returns current time in IST."""
    return datetime.now(pytz.timezone('Asia/Kolkata'))

@https_fn.on_call(
    region="asia-south1",
    memory=options.MemoryOption.GB_1,
    timeout_sec=300
)
def run_intelligence_analysis(req: https_fn.CallableRequest) -> any:
    db = firestore.client()
    ist_now = get_ist_now()
    
    print("Fetching comprehensive data for Python-powered Mission Control...")
    
    # 1. Fetch Data
    orders_list = [doc.to_dict() | {'id': doc.id} for doc in db.collection('orders').stream()]
    clients_list = [doc.to_dict() | {'id': doc.id} for doc in db.collection('customers').stream()]
    
    if not orders_list:
        return {"status": "error", "message": "No order data found to analyze"}

    # --- DATAFRAME PROCESSING ---
    df_orders = pd.DataFrame(orders_list)
    # Ensure date is treated correctly (handles string YYYY-MM-DD or full timestamp strings)
    df_orders['date_dt'] = pd.to_datetime(df_orders['date']).dt.tz_localize(None)
    df_orders['amount'] = pd.to_numeric(df_orders['qty'], errors='coerce') * pd.to_numeric(df_orders['rate'], errors='coerce')
    df_orders['status_norm'] = df_orders['status'].str.strip().str.lower()
    
    # Filter for revenue (Delivered or Completed)
    df_delivered = df_orders[df_orders['status_norm'].isin(['delivered', 'completed'])]
    
    # --- SALES ANALYTICS (KPIs) ---
    today_start = ist_now.replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)
    week_start = today_start - timedelta(days=ist_now.weekday())
    month_start = today_start.replace(day=1)

    def get_period_stats(df, start_date):
        period_df = df[df['date_dt'] >= start_date]
        return {
            'revenue': float(period_df['amount'].sum()),
            'count': int(len(period_df))
        }

    sales_stats = {
        'today': get_period_stats(df_delivered, today_start),
        'week': get_period_stats(df_delivered, week_start),
        'month': get_period_stats(df_delivered, month_start),
        'pending': int(len(df_orders[~df_orders['status_norm'].isin(['delivered', 'completed', 'cancelled'])]))
    }

    # --- DRILL-DOWN DATA (Lists for clicking on cards) ---
    today_delivered_list = df_delivered[df_delivered['date_dt'] >= today_start].to_dict(orient='records')
    # Filter for clean pending orders
    pending_list = df_orders[~df_orders['status_norm'].isin(['delivered', 'completed', 'cancelled'])].sort_values('date_dt', ascending=False).head(20).to_dict(orient='records')
    
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

    # --- INTELLIGENCE (RFM & PREDICTIONS) ---
    rfm = df_orders.groupby('clientName').agg({
        'date_dt': lambda x: (today_start - x.max()).days,
        'amount': 'sum',
        'id': 'count'
    }).rename(columns={'date_dt': 'recency', 'id': 'frequency', 'amount': 'monetary'})

    def segment_customer(row):
        if row['recency'] <= 7 and row['frequency'] >= 2: return 'Champion'
        if row['recency'] > 20: return 'At Risk'
        if row['frequency'] <= 1: return 'New'
        return 'Regular'
    
    rfm['segment'] = rfm.apply(segment_customer, axis=1)

    # Refill Alerts
    refill_alerts = []
    for name, group in df_orders.sort_values('date_dt').groupby('clientName'):
        if len(group) > 1:
            intervals = group['date_dt'].diff().dt.days.dropna()
            avg_interval = intervals.mean()
            if avg_interval > 0:
                last_order = group['date_dt'].max()
                predicted_next = last_order + timedelta(days=avg_interval)
                days_until = (predicted_next - today_start).days
                if -3 <= days_until <= 3:
                    refill_alerts.append({
                        'name': name,
                        'avgInterval': round(avg_interval, 1),
                        'lastOrder': last_order.strftime('%Y-%m-%d'),
                        'predictedDate': predicted_next.strftime('%Y-%m-%d'),
                        'urgency': 'High' if days_until <= 0 else 'Medium'
                    })

    # --- FINAL REPORT ---
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
    }
    
    db.collection('intelligence_reports').add(report)
    return {"status": "success", "message": "Python Mission Control Updated"}
