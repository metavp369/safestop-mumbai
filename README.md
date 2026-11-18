# SafeStop Mumbai – toilets, police, medical help and safe spots, fast

**Live:** https://safestop-mumbai.vercel.app (Vercel project feroz-shaikhs-projects/safestop-mumbai, deployed from C:\safestop with `npx vercel --prod`)

A free mobile web app (installable to the home screen) for finding the nearest public toilet in Mumbai. It is built with women, elderly people and children in mind.

## Features
- **⚠️ Unsafe-spot reports (shared)** – in Safe spot mode, users report dark lanes, broken streetlights, harassment spots or deserted stretches (anonymous, no names). Others see warning pins; safe spots whose path passes a report are flagged and ranked lower. Users confirm "still there" or "fixed"; 2+ "fixed" hides a report; reports fade after 6 months
- **🧭 Safe route** (Route tab) – from me / home / map to a searched place, home or map point. Shows the walking route, police, hospitals, clinics, chemists, petrol pumps, 24-hr shops and toilets along it (within 150 m) with their distance along the route, unsafe-spot reports on the route, and the longest stretch with no safe place. Save routes (e.g. a child's walk to school) and share them
- **🏠 Take me home** – save home address and landmark once (on the phone only). One tap for walk / auto / train directions, a full-screen "please take me here" card to show a driver (Hindi + English), and alert contacts that you're heading home
- **📞 Emergency contacts** – up to 5, saved on the phone only. Every SOS screen gets "SMS all my contacts" plus per-contact Call / WhatsApp with your location
- **🌙 Safe spot mode (women at night)** – one combined list of places usually open or staffed all night: police chowkis/stations, hospitals, petrol pumps, 24-hr chemists, shops and cafés, and stations. Police and hospitals rank highest; filters for confirmed 24 hrs or police & hospitals only. Emergency screen: Call 112, Call 1091 (women), send location on WhatsApp, walk to nearest safe spot. Users rate places after a visit (felt safe / dark / closed / unsafe) and can add their own
- **🏥 Medical mode** – nearest hospital, clinic or medical store; filters for hospitals / medical stores / clinics / 24 hrs / casualty; emergency screen shows Call 108, the nearest hospital (preferring one with casualty) and the nearest medical store; users can add missing places with type, phone and 24-hr flag
- **🚓 Police mode** – switch at the top to find the nearest police station or chowki. One-tap call to the station (if its number is on the map) or 112, walk or auto/car directions, report closed or wrong location, and add a missing station with its phone number
- **"I need a toilet NOW"** – one tap finds the nearest usable toilet and opens walking directions
- **Who needs it?** – Woman / Elderly / Child / Anyone changes the ranking (women's, accessible + western seat, baby-changing first)
- **Filters** – Women's, Wheelchair accessible, Baby change, Free, 24 hrs, Western seat
- **Backups** – petrol pumps, malls and railway stations when no public toilet is close
- **SOS** – 112, 1091, 181, 1098, 14567, 108, BMC 1916, plus sharing your location on WhatsApp
- **Cleanliness rating and reports** (closed / dirty / no water / unsafe); reported toilets drop down the list
- **Saved places** ⭐, **add a missing toilet**, link to add it to OpenStreetMap for everyone
- **English / हिंदी / मराठी**, **A+ large text**, offline cache of the last results
- Live data from **OpenStreetMap** (Overpass API), with no API key and no cost

## Deploy (5 minutes)
**Vercel:** push this folder to a GitHub repo, then import it at vercel.com/new and deploy (no build settings).
**GitHub Pages:** go to repo Settings → Pages → Deploy from branch → main / root.
Open the URL on your phone in Chrome, then Menu → *Add to Home screen*.

HTTPS is required for GPS, which both hosts give you automatically.

## Faster map data (shared cache)
`api/places.js` asks OpenStreetMap's free Overpass servers on the app's behalf and caches each answer in the same Upstash Redis for 12 hours. Search centres are snapped to a ~500 m grid, so people searching the same neighbourhood share one cached answer and get results almost instantly. If our server can't help, the app asks the public servers directly (trying a second one after 8 s).

## Shared community data
Ratings, reports (closed / dirty / unsafe / felt safe…) and places added by users are shared with everyone through `api/community.js`, a Vercel serverless function backed by **Upstash Redis** (Vercel → Storage → Upstash Redis, connected to this project).
- Anonymous: each phone gets a random device ID; one vote per phone per place; only the phone that added a place can delete it
- Places reported closed / wrong by 3+ people are hidden; bad reports push places down the list
- Limits per IP per hour (15 adds, 300 votes); places must be inside the Mumbai region
- If the database isn't connected, the app still works and keeps data on the phone

## Limits & next steps
- OSM coverage of Mumbai toilets is incomplete. Getting volunteers to map BMC/Sulabh toilets on OpenStreetMap improves the app for everyone.
- Possible additions: an official BMC toilet dataset, photos, SMS fallback, women-safety ratings for lighting and attendants.
