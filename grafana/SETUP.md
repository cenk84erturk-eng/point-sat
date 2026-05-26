# Grafana Cloud Setup

## 1. Create a free Grafana Cloud account
Go to https://grafana.com/auth/sign-up and create a free account.
Note your **Stack URL** — looks like `https://yourorg.grafana.net`.

## 2. Install the Infinity datasource
1. In Grafana Cloud, go to **Connections → Add new connection**
2. Search for **"Infinity"** and click **Install**
3. Go to **Connections → Data sources → Add data source → Infinity**
4. Name it `Point-Sat API`
5. Under **Allowed Hosts**, add: `point-sat-api.onrender.com`
6. Click **Save & Test** — should show "Datasource is working"

## 3. Import the dashboard
1. Go to **Dashboards → Import**
2. Upload `grafana/dashboard.json` from this repo
3. When prompted for the datasource, select `Point-Sat API`
4. Click **Import**

## 4. Use the dashboard
The dashboard has text-box variables at the top:

| Variable | Default | Notes |
|----------|---------|-------|
| API URL | `https://point-sat-api.onrender.com` | Change if self-hosting |
| lat / lon / alt | Ankara (39.9, 32.9, 938m) | Your ground station |
| freq_ghz | 11.7 | Starlink Ku-band downlink |
| norad_id | 48000 | NORAD ID from the web app pass list |
| aos / los | example times | Copy from the web app contact table |
| step_sec | 10 | Time-series resolution |

**Workflow:**
1. Open **https://point-sat-web.onrender.com** (or cenkerturk.space once DNS is set)
2. Drop a ground station on the map
3. Click a pass in the contact list to see its NORAD ID, AOS, and LOS
4. Paste those values into the Grafana dashboard variables
5. Panels show: delay (ms), Doppler (kHz), elevation (°), azimuth (°), range (km), range rate (km/s)

## 5. Optional: bookmark a pre-filled URL
After setting variables, copy the Grafana dashboard URL — it encodes all variable values so you can bookmark specific passes.
