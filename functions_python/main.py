# The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
from firebase_functions import https_fn, options

# The Firebase Admin SDK to access Cloud Firestore.
from firebase_admin import initialize_app, firestore
import pandas as pd
from datetime import datetime, timedelta

initialize_app()

@https_fn.on_call(
    region="asia-south1",
    memory=options.MemoryOption.GB_1,
    timeout_sec=300
)
def run_intelligence_analysis(req: https_fn.CallableRequest) -> any:
    db = firestore.client()
    
    print("Fetching data from Firestore...")
    # Fetch Orders
    orders_ref = db.collection('orders')
    orders_docs = orders_ref.stream()
    orders_list = []
    for doc in orders_docs:
        d = doc.to_dict()
        d['id'] = doc.id
        orders_list.append(d)
        
    if not orders_list:
        return {"status": "error", "message": "No data found to analyze"}

    df = pd.DataFrame(orders_list)
    
    # Preprocessing
    df['date'] = pd.to_datetime(df['date'])
    df['amount'] = pd.to_numeric(df['qty'], errors='coerce') * pd.to_numeric(df['rate'], errors='coerce')
    
    now = datetime.now()
    
    # 1. RFM Calculation
    rfm = df.groupby('clientName').agg({
        'date': lambda x: (now - x.max()).days,
        'amount': 'sum',
        'qty': 'count' 
    }).rename(columns={'date': 'recency', 'qty': 'frequency', 'amount': 'monetary'})
    
    # 2. Refill Prediction
    refill_alerts = []
    for name, group in df.sort_values('date').groupby('clientName'):
        if len(group) > 1:
            intervals = group['date'].diff().dt.days.dropna()
            avg_interval = intervals.mean()
            if avg_interval > 0:
                last_order = group['date'].max()
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

    # 3. Segmentation Logic
    def segment_customer(row):
        if row['recency'] <= 7 and row['frequency'] >= 2:
            return 'Champion'
        if row['recency'] > 20:
            return 'At Risk'
        if row['frequency'] <= 1:
            return 'New'
        return 'Regular'

    rfm['segment'] = rfm.apply(segment_customer, axis=1)
    
    # 4. Prepare Report
    report = {
        'timestamp': firestore.SERVER_TIMESTAMP,
        'summary': {
            'totalRevenue': float(rfm['monetary'].sum()),
            'activeCustomers': int(len(rfm)),
            'champions': int(len(rfm[rfm['segment'] == 'Champion'])),
            'atRisk': int(len(rfm[rfm['segment'] == 'At Risk']))
        },
        'refillAlerts': refill_alerts,
        'customerSegments': rfm.reset_index().to_dict(orient='records'),
        'forecast': {
            'next7DaysEstimate': float(rfm['monetary'].sum() / 30 * 7)
        }
    }
    
    # Write to Firestore
    print("Writing intelligence report to Firestore...")
    db.collection('intelligence_reports').add(report)
    
    return {"status": "success", "message": "Analysis complete"}
