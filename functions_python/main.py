# The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
from firebase_functions import https_fn, options

# The Firebase Admin SDK to access Cloud Firestore.
from firebase_admin import initialize_app, firestore
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import pytz

initialize_app()

def get_ist_now():
    """Returns current time in IST."""
    return datetime.now(pytz.timezone('Asia/Kolkata'))

def sanitize_data(obj):
    """Recursively converts pandas/numpy types to native Python types for Firestore."""
    if isinstance(obj, dict):
        return {k: sanitize_data(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_data(v) for v in obj]
    elif isinstance(obj, (pd.Timestamp, datetime)):
        if pd.isna(obj): return None
        return obj
    elif pd.isna(obj): # Handles NaN, NaT, None
        return None
    elif isinstance(obj, (np.int64, np.int32, np.int16)):
        return int(obj)
    elif isinstance(obj, (np.float64, np.float32, np.float16)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return sanitize_data(obj.tolist())
    return obj

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
    try:
        orders_list = [doc.to_dict() | {'id': doc.id} for doc in db.collection('orders').stream()]
        clients_list = [doc.to_dict() | {'id': doc.id} for doc in db.collection('customers').stream()]
    except Exception as e:
        print(f"Error fetching data: {e}")
        return {"status": "error", "message": f"Data fetch failed: {str(e)}"}
    
    if not orders_list:
        return {"status": "error", "message": "No order data found to analyze"}

    # --- DATAFRAME PROCESSING ---
    df_orders = pd.DataFrame(orders_list)
    # Ensure date is treated correctly
    df_orders['date_dt'] = pd.to_datetime(df_orders['date'], errors='coerce').dt.tz_localize(None)
    df_orders['amount'] = pd.to_numeric(df_orders['qty'], errors='coerce') * pd.to_numeric(df_orders['rate'], errors='coerce')
    df_orders['status_norm'] = df_orders['status'].str.strip().str.lower().fillna('pending')
    
    # Filter for revenue (Delivered or Completed)
    df_delivered = df_orders[df_orders['status_norm'].isin(['delivered', 'completed'])].copy()
    
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

    # --- DRILL-DOWN DATA ---
    def clean_records(df):
        if df.empty: return []
        # Convert datetime columns to strings to avoid serialization issues
        temp_df = df.copy()
        for col in temp_df.select_dtypes(include=['datetime64']).columns:
            temp_df[col] = temp_df[col].dt.strftime('%Y-%m-%d').fillna('')
        return temp_df.to_dict(orient='records')

    today_delivered_list = clean_records(df_delivered[df_delivered['date_dt'] >= today_start])
    pending_df = df_orders[~df_orders['status_norm'].isin(['delivered', 'completed', 'cancelled'])].sort_values('date_dt', ascending=False).head(20)
    pending_list = clean_records(pending_df)
    
    # Outstanding List
    outstanding_clients = []
    for c in clients_list:
        out_val = c.get('outstanding', 0)
        try:
            out_val = float(out_val)
        except (ValueError, TypeError):
            out_val = 0
            
        if out_val > 0:
            outstanding_clients.append({
                "name": c.get('name', 'Unnamed'),
                "outstanding": out_val,
                "mobile": c.get('mobile', '')
            })
            
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
    df_valid_dates = df_orders.dropna(subset=['date_dt'])
    if not df_valid_dates.empty:
        rfm = df_valid_dates.groupby('clientName').agg({
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
        customer_segments = rfm.reset_index().to_dict(orient='records')
        champions_count = int(len(rfm[rfm['segment'] == 'Champion']))
        at_risk_count = int(len(rfm[rfm['segment'] == 'At Risk']))
        active_customers = int(len(rfm))
    else:
        customer_segments = []
        champions_count = 0
        at_risk_count = 0
        active_customers = 0

    # Refill Alerts
    refill_alerts = []
    if not df_valid_dates.empty:
        for name, group in df_valid_dates.sort_values('date_dt').groupby('clientName'):
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
            'outstanding': outstanding_clients[:50]
        },
        'summary': {
            'totalRevenue': float(df_delivered['amount'].sum()),
            'activeCustomers': active_customers,
            'champions': champions_count,
            'atRisk': at_risk_count
        },
        'refillAlerts': sorted(refill_alerts, key=lambda x: x['urgency'] == 'High', reverse=True),
        'customerSegments': customer_segments,
        'forecast': {
            'next7DaysEstimate': float(df_delivered['amount'].sum() / 30 * 7) if not df_delivered.empty else 0
        }
    }
    
    # CRITICAL: Sanitize all data before Firestore write to remove NaT/NaN
    sanitized_report = sanitize_data(report)
    
    try:
        db.collection('intelligence_reports').add(sanitized_report)
        return {"status": "success", "message": "Python Mission Control Updated"}
    except Exception as e:
        print(f"Error writing report: {e}")
        return {"status": "error", "message": f"Failed to save report: {str(e)}"}
