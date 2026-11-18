function buildQuery(mode,lat,lon,backup){
  const R=mode==="police"?5000:mode==="medical"?3000:mode==="safe"?2000:2500;
  const a=`(around:${R+400},${(Math.round(lat*200)/200).toFixed(3)},${(Math.round(lon*200)/200).toFixed(3)})`;
  return mode==="safe"?`[out:json][timeout:25];(nwr["amenity"~"^(police|hospital|fuel)$"]${a};nwr["amenity"="pharmacy"]["opening_hours"="24/7"]${a};nwr["railway"="station"]${a};nwr["shop"]["opening_hours"="24/7"]${a};nwr["amenity"~"^(cafe|fast_food|restaurant)$"]["opening_hours"="24/7"]${a};);out center tags 300;`
   :mode==="medical"?`[out:json][timeout:25];(nwr["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]${a};nwr["healthcare"~"^(hospital|clinic|doctor|pharmacy)$"]${a};nwr["shop"="chemist"]${a};);out center tags 300;`
   :mode==="police"?`[out:json][timeout:25];(nwr["amenity"="police"]${a};);out center tags 200;`
   :`[out:json][timeout:25];(nwr["amenity"="toilets"]${a};${backup?`nwr["amenity"="fuel"]${a};nwr["shop"="mall"]${a};nwr["railway"="station"]${a};`:""});out center tags 200;`;
}
module.exports = { buildQuery };
