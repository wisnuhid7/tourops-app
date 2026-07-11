import fetch from 'node-fetch';
fetch('http://localhost:5000/api/flights/search?origin=Jakarta&destination=Singapore&date=2026-06-13').then(r=>r.text()).then(console.log);
