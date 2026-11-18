# SafeStop Mumbai – find a public toilet fast

A free mobile web app (installable to the home screen) for finding the nearest public toilet in Mumbai. It is built with women, elderly people and children in mind.

## Features
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

## Limits & next steps
- Ratings, reports and added toilets are saved **on each phone only**. To share them across users, add a backend (Supabase/Firebase).
- OSM coverage of Mumbai toilets is incomplete. Getting volunteers to map BMC/Sulabh toilets on OpenStreetMap improves the app for everyone.
- Possible additions: an official BMC toilet dataset, photos, SMS fallback, women-safety ratings for lighting and attendants.
