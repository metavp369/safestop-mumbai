// Busy areas per city, used by the nightly worker to pre-load map data and build the safety report.
// Keep in step with CITIES in index.html.
const CITY_AREAS = {
  Mumbai: [["CSMT / Fort",18.9400,72.8353],["Colaba",18.9067,72.8147],["Marine Drive / Churchgate",18.9440,72.8235],["Lower Parel",18.9953,72.8302],["Dadar",19.0178,72.8478],["Sion",19.0390,72.8619],["Bandra",19.0596,72.8295],["Kurla",19.0726,72.8845],["Chembur",19.0522,72.9005],["Ghatkopar",19.0860,72.9081],["Vile Parle",19.0990,72.8492],["Juhu",19.1075,72.8263],["Andheri",19.1197,72.8468],["Powai",19.1176,72.9060],["Goregaon",19.1663,72.8526],["Malad",19.1874,72.8484],["Mulund",19.1726,72.9425],["Borivali",19.2307,72.8567],["Thane",19.2183,72.9781],["Vashi",19.0771,72.9986]],
  Delhi: [["Connaught Place",28.6315,77.2167],["New Delhi Rly Station",28.6430,77.2194],["Chandni Chowk",28.6506,77.2303],["Kashmere Gate ISBT",28.6675,77.2282],["Karol Bagh",28.6519,77.1909],["Rajouri Garden",28.6492,77.1226],["Janakpuri",28.6219,77.0878],["Dwarka",28.5921,77.0460],["Airport T3",28.5550,77.0844],["Vasant Kunj",28.5200,77.1580],["Hauz Khas",28.5494,77.2001],["Saket",28.5245,77.2066],["Lajpat Nagar",28.5677,77.2433],["Nehru Place",28.5491,77.2533],["Hazrat Nizamuddin",28.5893,77.2507],["Laxmi Nagar",28.6304,77.2777],["Mayur Vihar",28.6040,77.2890],["Model Town",28.7159,77.1910],["Pitampura",28.6990,77.1384],["Rohini",28.7383,77.0822]],
  Gurgaon: [["Cyber City / Cyber Hub",28.4950,77.0890],["MG Road",28.4795,77.0800],["IFFCO Chowk",28.4720,77.0720],["Millennium City Centre",28.4594,77.0727],["Golf Course Road",28.4560,77.1000],["Sector 29",28.4680,77.0630],["Old Gurgaon / Sadar Bazar",28.4640,77.0290],["Sohna Road",28.4280,77.0390],["Sector 56",28.4240,77.1040],["Udyog Vihar",28.5030,77.0790],["Ambience Mall",28.5052,77.0960],["Manesar",28.3590,76.9410]],
};
// [name, lat, lon]; Delhi and Gurgaon areas carry the city name so the report is clear
const AREAS = [].concat(...Object.entries(CITY_AREAS).map(([c, l]) => l.map(([n, a, b]) => [c === "Mumbai" ? n : `${n}, ${c}`, a, b])));
// Where community places may be added: [minLat, maxLat, minLon, maxLon]
const BOXES = [[18.85, 19.5, 72.7, 73.25], [28.40, 28.89, 76.83, 77.35], [28.30, 28.52, 76.85, 77.15]];
module.exports = { CITY_AREAS, AREAS, BOXES };
