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
    
    print("Fetching data from Firestore...")
    # Fetch Orders
    orders_ref = db.collection('orders')
    orders_docs = orders_ref.stream()
    orders_list = []
    for doc in orders_docs:
        d = doc.to_dict()
        d['id'] = doc.id
        orders_list.append(d)
        
    if not orders_list and test_mode:
        print("No orders found. Generating mock data for demonstration...")
        # Mock data logic if empty
        orders_list = [
            {'clientName': 'Jigneshbhai', 'qty': 150, 'rate': 12, 'date': (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')},
            {'clientName': 'Jigneshbhai', 'qty': 100, 'rate': 12, 'date': (datetime.now() - timedelta(days=12)).strftime('%Y-%m-%d')},
            {'clientName': 'KiaMotors', 'qty': 80, 'rate': 15, 'date': (datetime.now() - timedelta(days=5)).strftime('%Y-%m-%d')},
            {'clientName': 'KiaMotors', 'qty': 80, 'rate': 15, 'date': (datetime.now() - timedelta(days=15)).strftime('%Y-%m-%d')},
            {'clientName': 'Reliance', 'qty': 500, 'rate': 10, 'date': (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')},
        ]

    if not orders_list:
        print("Error: No data to analyze.")
        return

    df = pd.DataFrame(orders_list)
    
    # Preprocessing
    df['date'] = pd.to_datetime(df['date'])
    df['amount'] = pd.to_numeric(df['qty'], errors='coerce') * pd.to_numeric(df['rate'], errors='coerce')
    
    now = datetime.now()
    
    # 1. RFM Calculation
    # Recency: Days since last order
    # Frequency: Count of orders
    # Monetary: Total revenue
    rfm = df.groupby('clientName').agg({
        'date': lambda x: (now - x.max()).days,
        'amount': 'sum',
        'qty': 'count' # Using qty count as proxy for frequency
    }).rename(columns={'date': 'recency', 'qty': 'frequency', 'amount': 'monetary'})
    
    # 2. Refill Prediction
    # Calculate average interval between orders for each client
    refill_alerts = []
    for name, group in df.sort_values('date').groupby('clientName'):
        if len(group) > 1:
            intervals = group['date'].diff().dt.days.dropna()
            avg_interval = intervals.mean()
            if avg_interval > 0:
                last_order = group['date'].max()
                predicted_next = last_order + timedelta(days=avg_interval)
                
                # If predicted date is within +/- 3 days of now, alert
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
            'next7DaysEstimate': float(rfm['monetary'].sum() / 30 * 7) # Simplified projection
        }
    }
    
    # Write to Firestore
    print("Writing intelligence report to Firestore...")
    db.collection('intelligence_reports').add(report)
    print("Analysis complete!")

if __name__ == "__main__":
    run_analysis()
