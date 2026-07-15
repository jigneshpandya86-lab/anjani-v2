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
    
    def parse_order_date(row):
        d = row.get('date')
        if pd.notna(d) and d != '':
            return pd.to_datetime(d)
        
        dd = row.get('deliveryDate')
        if pd.notna(dd) and dd != '':
            return pd.to_datetime(dd)
        
        od = row.get('orderDate')
        if pd.notna(od) and od != '':
            return pd.to_datetime(od)
        
        ca = row.get('createdAt')
        if pd.notna(ca):
            if hasattr(ca, 'toDate'):
                return pd.to_datetime(ca.toDate())
            elif isinstance(ca, dict) and '_seconds' in ca:
                return pd.to_datetime(ca['_seconds'], unit='s')
            return pd.to_datetime(ca)
            
        return pd.NaT

    def parse_order_amount(row):
        amt = row.get('amount')
        if pd.notna(amt) and amt != '':
            try:
                val = float(amt)
                if val > 0:
                    return val
            except:
                pass
        
        qty = row.get('qty')
        if pd.isna(qty) or qty == '':
            qty = row.get('boxes')
        
        rate = row.get('rate')
        if pd.isna(qty) or qty == '' or pd.isna(rate) or rate == '':
            return 0.0
        
        try:
            return float(qty) * float(rate)
        except:
            return 0.0

    df_orders['date_dt'] = df_orders.apply(parse_order_date, axis=1)
    df_orders['amount'] = df_orders.apply(parse_order_amount, axis=1)
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
    def clean_df_for_firestore(df):
        if df.empty:
            return []
        df_clean = df.copy()
        if 'date_dt' in df_clean.columns:
            df_clean = df_clean.drop(columns=['date_dt'])
        
        # Standardize all datatypes to object and replace NaN/NaT with None
        for col in df_clean.columns:
            df_clean[col] = df_clean[col].astype(object)
            df_clean[col] = df_clean[col].where(df_clean[col].notna(), None)
            
        return df_clean.to_dict(orient='records')

    today_delivered_list = clean_df_for_firestore(df_delivered[df_delivered['date_dt'] >= today_start])
    week_delivered_list = clean_df_for_firestore(df_delivered[df_delivered['date_dt'] >= week_start])
    month_delivered_list = clean_df_for_firestore(df_delivered[df_delivered['date_dt'] >= month_start])
    
    # Filter for clean pending orders
    pending_list = clean_df_for_firestore(df_orders[~df_orders['status_norm'].isin(['delivered', 'completed', 'cancelled'])].sort_values('date_dt', ascending=False).head(20))
    
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

    # Map mobile number to RFM
    client_mobiles = {c.get('name'): c.get('mobile', '') for c in clients_list if c.get('name')}
    rfm['mobile'] = rfm.index.map(lambda name: client_mobiles.get(name, ''))

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
                    mob = client_mobiles.get(name, '')
                    refill_alerts.append({
                        'name': name,
                        'mobile': mob,
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
            'weekDelivered': week_delivered_list,
            'monthDelivered': month_delivered_list,
            'pending': pending_list,
            'outstanding': outstanding_clients[:50] # Top 50 outstanding
        },
        'summary': {
            'totalRevenue': float(df_delivered['amount'].sum()),
            'activeCustomers': int(len(rfm)),
            'champions': int(len(rfm[rfm['segment'] == 'Champion'])),
            'regulars': int(len(rfm[rfm['segment'] == 'Regular'])),
            'newCustomers': int(len(rfm[rfm['segment'] == 'New'])),
            'atRisk': int(len(rfm[rfm['segment'] == 'At Risk']))
        },
        'refillAlerts': sorted(refill_alerts, key=lambda x: x['urgency'] == 'High', reverse=True),
        'customerSegments': rfm.reset_index().to_dict(orient='records'),
    }
    
    db.collection('intelligence_reports').add(report)
    return {"status": "success", "message": "Python Mission Control Updated"}
