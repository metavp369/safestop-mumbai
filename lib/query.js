function namesQuery(lat,lon){
  // Streets, stations and landmarks close to each toilet, used to give unnamed toilets a useful name.
  const a=`(around:2900,${(Math.round(lat*200)/200).toFixed(3)},${(Math.round(lon*200)/200).toFixed(3)})`;
  return `[out:json][timeout:25];nwr["amenity"="toilets"]${a}->.t;way(around.t:70)["highway"]["name"]["highway"!~"^(footway|path|steps|corridor|platform|cycleway|bridleway|proposed|construction)$"];out tags geom 400;(nwr(around.t:400)["railway"~"^(station|halt)$"]["name"];nwr(around.t:130)["amenity"~"^(bus_station|marketplace|place_of_worship|hospital|college|university|cinema|police|post_office|townhall)$"]["name"];nwr(around.t:130)["shop"="mall"]["name"];nwr(around.t:130)["leisure"~"^(park|stadium)$"]["name"];nwr(around.t:130)["tourism"~"^(attraction|museum)$"]["name"];node(around.t:1200)["place"~"^(suburb|neighbourhood|quarter)$"]["name"];);out center tags 400;`;
}
function buildQuery(mode,lat,lon,backup){
  if(mode==="names")return namesQuery(lat,lon);
  const R=mode==="police"?5000:mode==="medical"||mode==="transit"?3000:mode==="safe"?2000:2500;
  const a=`(around:${R+400},${(Math.round(lat*200)/200).toFixed(3)},${(Math.round(lon*200)/200).toFixed(3)})`;
  return mode==="transit"?`[out:json][timeout:25];(nwr["railway"~"^(station|halt)$"]${a};nwr["public_transport"="station"]["station"~"^(subway|light_rail|monorail)$"]${a};);out center tags 200;`
   :mode==="safe"?`[out:json][timeout:25];(nwr["amenity"~"^(police|hospital|fuel)$"]${a};nwr["amenity"="pharmacy"]["opening_hours"="24/7"]${a};nwr["railway"="station"]${a};nwr["shop"]["opening_hours"="24/7"]${a};nwr["amenity"~"^(cafe|fast_food|restaurant)$"]["opening_hours"="24/7"]${a};);out center tags 300;`
   :mode==="medical"?`[out:json][timeout:25];(nwr["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]${a};nwr["healthcare"~"^(hospital|clinic|doctor|pharmacy)$"]${a};nwr["shop"="chemist"]${a};);out center tags 300;`
   :mode==="police"?`[out:json][timeout:25];(nwr["amenity"="police"]${a};);out center tags 200;`
   :`[out:json][timeout:25];(nwr["amenity"="toilets"]${a};${backup?`nwr["amenity"="fuel"]${a};nwr["shop"="mall"]${a};nwr["railway"="station"]${a};`:""});out center tags 200;`;
}
module.exports = { buildQuery };
