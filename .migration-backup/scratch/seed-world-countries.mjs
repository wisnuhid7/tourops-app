/**
 * Seed ALL world countries directly via SQL using the comprehensive ISO 3166-1 list.
 * This bypasses the external API dependency and runs directly against the DB.
 */
import { Client } from 'ssh2';

// Complete list of ~195 countries from ISO 3166-1
const countries = [
  ['AF','AFG','Afghanistan','Kabul','Asia','Southern Asia','AFN','Afghan Afghani','+93','33.0','65.0'],
  ['AL','ALB','Albania','Tirana','Europe','Southern Europe','ALL','Albanian lek','+355','41.0','20.0'],
  ['DZ','DZA','Algeria','Algiers','Africa','Northern Africa','DZD','Algerian dinar','+213','28.0','3.0'],
  ['AD','AND','Andorra','Andorra la Vella','Europe','Southern Europe','EUR','Euro','+376','42.5','1.5'],
  ['AO','AGO','Angola','Luanda','Africa','Middle Africa','AOA','Angolan kwanza','+244','-12.5','18.5'],
  ['AG','ATG','Antigua and Barbuda','Saint John\'s','Americas','Caribbean','XCD','Eastern Caribbean dollar','+1268','17.05','-61.8'],
  ['AR','ARG','Argentina','Buenos Aires','Americas','South America','ARS','Argentine peso','+54','-34.0','-64.0'],
  ['AM','ARM','Armenia','Yerevan','Asia','Western Asia','AMD','Armenian dram','+374','40.0','45.0'],
  ['AU','AUS','Australia','Canberra','Oceania','Australia and New Zealand','AUD','Australian dollar','+61','-27.0','133.0'],
  ['AT','AUT','Austria','Vienna','Europe','Western Europe','EUR','Euro','+43','47.33','13.33'],
  ['AZ','AZE','Azerbaijan','Baku','Asia','Western Asia','AZN','Azerbaijani manat','+994','40.5','47.5'],
  ['BS','BHS','Bahamas','Nassau','Americas','Caribbean','BSD','Bahamian dollar','+1242','24.25','-76.0'],
  ['BH','BHR','Bahrain','Manama','Asia','Western Asia','BHD','Bahraini dinar','+973','26.0','50.55'],
  ['BD','BGD','Bangladesh','Dhaka','Asia','Southern Asia','BDT','Bangladeshi taka','+880','24.0','90.0'],
  ['BB','BRB','Barbados','Bridgetown','Americas','Caribbean','BBD','Barbadian dollar','+1246','13.17','-59.53'],
  ['BY','BLR','Belarus','Minsk','Europe','Eastern Europe','BYN','Belarusian ruble','+375','53.0','28.0'],
  ['BE','BEL','Belgium','Brussels','Europe','Western Europe','EUR','Euro','+32','50.83','4.0'],
  ['BZ','BLZ','Belize','Belmopan','Americas','Central America','BZD','Belize dollar','+501','17.25','-88.75'],
  ['BJ','BEN','Benin','Porto-Novo','Africa','Western Africa','XOF','West African CFA franc','+229','9.5','2.25'],
  ['BT','BTN','Bhutan','Thimphu','Asia','Southern Asia','BTN','Bhutanese ngultrum','+975','27.5','90.5'],
  ['BO','BOL','Bolivia','Sucre','Americas','South America','BOB','Bolivian boliviano','+591','-17.0','-65.0'],
  ['BA','BIH','Bosnia and Herzegovina','Sarajevo','Europe','Southern Europe','BAM','Bosnia-Herzegovina convertible mark','+387','44.0','17.5'],
  ['BW','BWA','Botswana','Gaborone','Africa','Southern Africa','BWP','Botswana pula','+267','-22.0','24.0'],
  ['BR','BRA','Brazil','Brasilia','Americas','South America','BRL','Brazilian real','+55','-10.0','-55.0'],
  ['BN','BRN','Brunei','Bandar Seri Begawan','Asia','South-Eastern Asia','BND','Brunei dollar','+673','4.5','114.67'],
  ['BG','BGR','Bulgaria','Sofia','Europe','Eastern Europe','BGN','Bulgarian lev','+359','43.0','25.0'],
  ['BF','BFA','Burkina Faso','Ouagadougou','Africa','Western Africa','XOF','West African CFA franc','+226','13.0','-2.0'],
  ['BI','BDI','Burundi','Gitega','Africa','Eastern Africa','BIF','Burundian franc','+257','-3.5','30.0'],
  ['CV','CPV','Cape Verde','Praia','Africa','Western Africa','CVE','Cape Verdean escudo','+238','16.0','-24.0'],
  ['KH','KHM','Cambodia','Phnom Penh','Asia','South-Eastern Asia','KHR','Cambodian riel','+855','13.0','105.0'],
  ['CM','CMR','Cameroon','Yaoundé','Africa','Middle Africa','XAF','Central African CFA franc','+237','6.0','12.0'],
  ['CA','CAN','Canada','Ottawa','Americas','Northern America','CAD','Canadian dollar','+1','60.0','-95.0'],
  ['CF','CAF','Central African Republic','Bangui','Africa','Middle Africa','XAF','Central African CFA franc','+236','7.0','21.0'],
  ['TD','TCD','Chad','N\'Djamena','Africa','Middle Africa','XAF','Central African CFA franc','+235','15.0','19.0'],
  ['CL','CHL','Chile','Santiago','Americas','South America','CLP','Chilean peso','+56','-30.0','-71.0'],
  ['CN','CHN','China','Beijing','Asia','Eastern Asia','CNY','Chinese Yuan','+86','35.0','105.0'],
  ['CO','COL','Colombia','Bogotá','Americas','South America','COP','Colombian peso','+57','4.0','-72.0'],
  ['KM','COM','Comoros','Moroni','Africa','Eastern Africa','KMF','Comorian franc','+269','-12.17','44.25'],
  ['CD','COD','DR Congo','Kinshasa','Africa','Middle Africa','CDF','Congolese franc','+243','0.0','25.0'],
  ['CG','COG','Republic of the Congo','Brazzaville','Africa','Middle Africa','XAF','Central African CFA franc','+242','-1.0','15.0'],
  ['CR','CRI','Costa Rica','San José','Americas','Central America','CRC','Costa Rican colón','+506','10.0','-84.0'],
  ['HR','HRV','Croatia','Zagreb','Europe','Southern Europe','EUR','Euro','+385','45.17','15.5'],
  ['CU','CUB','Cuba','Havana','Americas','Caribbean','CUP','Cuban peso','+53','21.5','-80.0'],
  ['CY','CYP','Cyprus','Nicosia','Asia','Western Asia','EUR','Euro','+357','35.0','33.0'],
  ['CZ','CZE','Czech Republic','Prague','Europe','Eastern Europe','CZK','Czech koruna','+420','49.75','15.5'],
  ['DK','DNK','Denmark','Copenhagen','Europe','Northern Europe','DKK','Danish krone','+45','56.0','10.0'],
  ['DJ','DJI','Djibouti','Djibouti','Africa','Eastern Africa','DJF','Djiboutian franc','+253','11.5','43.0'],
  ['DM','DMA','Dominica','Roseau','Americas','Caribbean','XCD','Eastern Caribbean dollar','+1767','15.42','-61.33'],
  ['DO','DOM','Dominican Republic','Santo Domingo','Americas','Caribbean','DOP','Dominican peso','+1809','19.0','-70.67'],
  ['EC','ECU','Ecuador','Quito','Americas','South America','USD','US Dollar','+593','-2.0','-77.5'],
  ['EG','EGY','Egypt','Cairo','Africa','Northern Africa','EGP','Egyptian pound','+20','27.0','30.0'],
  ['SV','SLV','El Salvador','San Salvador','Americas','Central America','USD','US Dollar','+503','13.83','-88.92'],
  ['GQ','GNQ','Equatorial Guinea','Malabo','Africa','Middle Africa','XAF','Central African CFA franc','+240','2.0','10.0'],
  ['ER','ERI','Eritrea','Asmara','Africa','Eastern Africa','ERN','Eritrean nakfa','+291','15.0','39.0'],
  ['EE','EST','Estonia','Tallinn','Europe','Northern Europe','EUR','Euro','+372','59.0','26.0'],
  ['SZ','SWZ','Eswatini','Mbabane','Africa','Southern Africa','SZL','Swazi lilangeni','+268','-26.5','31.5'],
  ['ET','ETH','Ethiopia','Addis Ababa','Africa','Eastern Africa','ETB','Ethiopian birr','+251','8.0','38.0'],
  ['FJ','FJI','Fiji','Suva','Oceania','Melanesia','FJD','Fijian dollar','+679','-18.0','175.0'],
  ['FI','FIN','Finland','Helsinki','Europe','Northern Europe','EUR','Euro','+358','64.0','26.0'],
  ['FR','FRA','France','Paris','Europe','Western Europe','EUR','Euro','+33','46.0','2.0'],
  ['GA','GAB','Gabon','Libreville','Africa','Middle Africa','XAF','Central African CFA franc','+241','-1.0','11.75'],
  ['GM','GMB','Gambia','Banjul','Africa','Western Africa','GMD','Gambian dalasi','+220','13.47','-16.57'],
  ['GE','GEO','Georgia','Tbilisi','Asia','Western Asia','GEL','Georgian lari','+995','42.0','43.5'],
  ['DE','DEU','Germany','Berlin','Europe','Western Europe','EUR','Euro','+49','51.0','9.0'],
  ['GH','GHA','Ghana','Accra','Africa','Western Africa','GHS','Ghanaian cedi','+233','8.0','-2.0'],
  ['GR','GRC','Greece','Athens','Europe','Southern Europe','EUR','Euro','+30','39.0','22.0'],
  ['GD','GRD','Grenada','Saint George\'s','Americas','Caribbean','XCD','Eastern Caribbean dollar','+1473','12.12','-61.67'],
  ['GT','GTM','Guatemala','Guatemala City','Americas','Central America','GTQ','Guatemalan quetzal','+502','15.5','-90.25'],
  ['GN','GIN','Guinea','Conakry','Africa','Western Africa','GNF','Guinean franc','+224','11.0','-10.0'],
  ['GW','GNB','Guinea-Bissau','Bissau','Africa','Western Africa','XOF','West African CFA franc','+245','12.0','-15.0'],
  ['GY','GUY','Guyana','Georgetown','Americas','South America','GYD','Guyanese dollar','+592','5.0','-59.0'],
  ['HT','HTI','Haiti','Port-au-Prince','Americas','Caribbean','HTG','Haitian gourde','+509','19.0','-72.42'],
  ['HN','HND','Honduras','Tegucigalpa','Americas','Central America','HNL','Honduran lempira','+504','15.0','-86.5'],
  ['HU','HUN','Hungary','Budapest','Europe','Eastern Europe','HUF','Hungarian forint','+36','47.0','20.0'],
  ['IS','ISL','Iceland','Reykjavik','Europe','Northern Europe','ISK','Icelandic króna','+354','65.0','-18.0'],
  ['IN','IND','India','New Delhi','Asia','Southern Asia','INR','Indian rupee','+91','20.0','77.0'],
  ['ID','IDN','Indonesia','Jakarta','Asia','South-Eastern Asia','IDR','Indonesian rupiah','+62','-5.0','120.0'],
  ['IR','IRN','Iran','Tehran','Asia','Southern Asia','IRR','Iranian rial','+98','32.0','53.0'],
  ['IQ','IRQ','Iraq','Baghdad','Asia','Western Asia','IQD','Iraqi dinar','+964','33.0','44.0'],
  ['IE','IRL','Ireland','Dublin','Europe','Northern Europe','EUR','Euro','+353','53.0','-8.0'],
  ['IL','ISR','Israel','Jerusalem','Asia','Western Asia','ILS','Israeli New Shekel','+972','31.5','34.75'],
  ['IT','ITA','Italy','Rome','Europe','Southern Europe','EUR','Euro','+39','42.83','12.83'],
  ['JM','JAM','Jamaica','Kingston','Americas','Caribbean','JMD','Jamaican dollar','+1876','18.25','-77.5'],
  ['JP','JPN','Japan','Tokyo','Asia','Eastern Asia','JPY','Japanese yen','+81','36.0','138.0'],
  ['JO','JOR','Jordan','Amman','Asia','Western Asia','JOD','Jordanian dinar','+962','31.0','36.0'],
  ['KZ','KAZ','Kazakhstan','Astana','Asia','Central Asia','KZT','Kazakhstani tenge','+7','48.0','68.0'],
  ['KE','KEN','Kenya','Nairobi','Africa','Eastern Africa','KES','Kenyan shilling','+254','1.0','38.0'],
  ['KI','KIR','Kiribati','South Tarawa','Oceania','Micronesia','AUD','Australian dollar','+686','1.42','173.0'],
  ['KW','KWT','Kuwait','Kuwait City','Asia','Western Asia','KWD','Kuwaiti dinar','+965','29.5','45.75'],
  ['KG','KGZ','Kyrgyzstan','Bishkek','Asia','Central Asia','KGS','Kyrgystani som','+996','41.0','75.0'],
  ['LA','LAO','Laos','Vientiane','Asia','South-Eastern Asia','LAK','Lao kip','+856','18.0','105.0'],
  ['LV','LVA','Latvia','Riga','Europe','Northern Europe','EUR','Euro','+371','57.0','25.0'],
  ['LB','LBN','Lebanon','Beirut','Asia','Western Asia','LBP','Lebanese pound','+961','33.83','35.83'],
  ['LS','LSO','Lesotho','Maseru','Africa','Southern Africa','LSL','Lesotho loti','+266','-29.5','28.5'],
  ['LR','LBR','Liberia','Monrovia','Africa','Western Africa','LRD','Liberian dollar','+231','6.5','-9.5'],
  ['LY','LBY','Libya','Tripoli','Africa','Northern Africa','LYD','Libyan dinar','+218','25.0','17.0'],
  ['LI','LIE','Liechtenstein','Vaduz','Europe','Western Europe','CHF','Swiss franc','+423','47.27','9.55'],
  ['LT','LTU','Lithuania','Vilnius','Europe','Northern Europe','EUR','Euro','+370','56.0','24.0'],
  ['LU','LUX','Luxembourg','Luxembourg City','Europe','Western Europe','EUR','Euro','+352','49.75','6.17'],
  ['MG','MDG','Madagascar','Antananarivo','Africa','Eastern Africa','MGA','Malagasy ariary','+261','-20.0','47.0'],
  ['MW','MWI','Malawi','Lilongwe','Africa','Eastern Africa','MWK','Malawian kwacha','+265','-13.5','34.0'],
  ['MY','MYS','Malaysia','Kuala Lumpur','Asia','South-Eastern Asia','MYR','Malaysian ringgit','+60','2.5','112.5'],
  ['MV','MDV','Maldives','Malé','Asia','Southern Asia','MVR','Maldivian rufiyaa','+960','3.25','73.0'],
  ['ML','MLI','Mali','Bamako','Africa','Western Africa','XOF','West African CFA franc','+223','17.0','-4.0'],
  ['MT','MLT','Malta','Valletta','Europe','Southern Europe','EUR','Euro','+356','35.83','14.58'],
  ['MH','MHL','Marshall Islands','Majuro','Oceania','Micronesia','USD','US Dollar','+692','9.0','168.0'],
  ['MR','MRT','Mauritania','Nouakchott','Africa','Western Africa','MRU','Mauritanian ouguiya','+222','20.0','-12.0'],
  ['MU','MUS','Mauritius','Port Louis','Africa','Eastern Africa','MUR','Mauritian rupee','+230','-20.28','57.55'],
  ['MX','MEX','Mexico','Mexico City','Americas','Central America','MXN','Mexican peso','+52','23.0','-102.0'],
  ['FM','FSM','Micronesia','Palikir','Oceania','Micronesia','USD','US Dollar','+691','6.92','158.25'],
  ['MD','MDA','Moldova','Chișinău','Europe','Eastern Europe','MDL','Moldovan leu','+373','47.0','29.0'],
  ['MC','MCO','Monaco','Monaco','Europe','Western Europe','EUR','Euro','+377','43.73','7.4'],
  ['MN','MNG','Mongolia','Ulaanbaatar','Asia','Eastern Asia','MNT','Mongolian tögrög','+976','46.0','105.0'],
  ['ME','MNE','Montenegro','Podgorica','Europe','Southern Europe','EUR','Euro','+382','42.5','19.3'],
  ['MA','MAR','Morocco','Rabat','Africa','Northern Africa','MAD','Moroccan dirham','+212','32.0','-5.0'],
  ['MZ','MOZ','Mozambique','Maputo','Africa','Eastern Africa','MZN','Mozambican metical','+258','-18.25','35.0'],
  ['MM','MMR','Myanmar','Naypyidaw','Asia','South-Eastern Asia','MMK','Myanmar kyat','+95','22.0','98.0'],
  ['NA','NAM','Namibia','Windhoek','Africa','Southern Africa','NAD','Namibian dollar','+264','-22.0','17.0'],
  ['NR','NRU','Nauru','Yaren','Oceania','Micronesia','AUD','Australian dollar','+674','-0.53','166.92'],
  ['NP','NPL','Nepal','Kathmandu','Asia','Southern Asia','NPR','Nepalese rupee','+977','28.0','84.0'],
  ['NL','NLD','Netherlands','Amsterdam','Europe','Western Europe','EUR','Euro','+31','52.5','5.75'],
  ['NZ','NZL','New Zealand','Wellington','Oceania','Australia and New Zealand','NZD','New Zealand dollar','+64','-41.0','174.0'],
  ['NI','NIC','Nicaragua','Managua','Americas','Central America','NIO','Nicaraguan córdoba','+505','13.0','-85.0'],
  ['NE','NER','Niger','Niamey','Africa','Western Africa','XOF','West African CFA franc','+227','16.0','8.0'],
  ['NG','NGA','Nigeria','Abuja','Africa','Western Africa','NGN','Nigerian naira','+234','10.0','8.0'],
  ['MK','MKD','North Macedonia','Skopje','Europe','Southern Europe','MKD','Macedonian denar','+389','41.83','22.0'],
  ['NO','NOR','Norway','Oslo','Europe','Northern Europe','NOK','Norwegian krone','+47','62.0','10.0'],
  ['OM','OMN','Oman','Muscat','Asia','Western Asia','OMR','Omani rial','+968','21.0','57.0'],
  ['PK','PAK','Pakistan','Islamabad','Asia','Southern Asia','PKR','Pakistani rupee','+92','30.0','70.0'],
  ['PW','PLW','Palau','Ngerulmud','Oceania','Micronesia','USD','US Dollar','+680','7.5','134.5'],
  ['PS','PSE','Palestine','Ramallah','Asia','Western Asia','ILS','Israeli New Shekel','+970','31.9','35.2'],
  ['PA','PAN','Panama','Panama City','Americas','Central America','PAB','Panamanian balboa','+507','9.0','-80.0'],
  ['PG','PNG','Papua New Guinea','Port Moresby','Oceania','Melanesia','PGK','Papua New Guinean kina','+675','-6.0','147.0'],
  ['PY','PRY','Paraguay','Asunción','Americas','South America','PYG','Paraguayan guaraní','+595','-23.0','-58.0'],
  ['PE','PER','Peru','Lima','Americas','South America','PEN','Peruvian sol','+51','-10.0','-76.0'],
  ['PH','PHL','Philippines','Manila','Asia','South-Eastern Asia','PHP','Philippine peso','+63','13.0','122.0'],
  ['PL','POL','Poland','Warsaw','Europe','Eastern Europe','PLN','Polish złoty','+48','52.0','20.0'],
  ['PT','PRT','Portugal','Lisbon','Europe','Southern Europe','EUR','Euro','+351','39.5','-8.0'],
  ['QA','QAT','Qatar','Doha','Asia','Western Asia','QAR','Qatari riyal','+974','25.5','51.25'],
  ['RO','ROU','Romania','Bucharest','Europe','Eastern Europe','RON','Romanian leu','+40','46.0','25.0'],
  ['RU','RUS','Russia','Moscow','Europe','Eastern Europe','RUB','Russian ruble','+7','60.0','100.0'],
  ['RW','RWA','Rwanda','Kigali','Africa','Eastern Africa','RWF','Rwandan franc','+250','-2.0','30.0'],
  ['KN','KNA','Saint Kitts and Nevis','Basseterre','Americas','Caribbean','XCD','Eastern Caribbean dollar','+1869','17.33','-62.75'],
  ['LC','LCA','Saint Lucia','Castries','Americas','Caribbean','XCD','Eastern Caribbean dollar','+1758','13.88','-60.97'],
  ['VC','VCT','Saint Vincent and the Grenadines','Kingstown','Americas','Caribbean','XCD','Eastern Caribbean dollar','+1784','13.25','-61.2'],
  ['WS','WSM','Samoa','Apia','Oceania','Polynesia','WST','Samoan tālā','+685','-13.58','-172.33'],
  ['SM','SMR','San Marino','City of San Marino','Europe','Southern Europe','EUR','Euro','+378','43.77','12.42'],
  ['ST','STP','São Tomé and Príncipe','São Tomé','Africa','Middle Africa','STN','São Tomé and Príncipe dobra','+239','1.0','7.0'],
  ['SA','SAU','Saudi Arabia','Riyadh','Asia','Western Asia','SAR','Saudi riyal','+966','25.0','45.0'],
  ['SN','SEN','Senegal','Dakar','Africa','Western Africa','XOF','West African CFA franc','+221','14.0','-14.0'],
  ['RS','SRB','Serbia','Belgrade','Europe','Southern Europe','RSD','Serbian dinar','+381','44.0','21.0'],
  ['SC','SYC','Seychelles','Victoria','Africa','Eastern Africa','SCR','Seychellois rupee','+248','-4.58','55.67'],
  ['SL','SLE','Sierra Leone','Freetown','Africa','Western Africa','SLL','Sierra Leonean leone','+232','8.5','-11.5'],
  ['SG','SGP','Singapore','Singapore','Asia','South-Eastern Asia','SGD','Singapore dollar','+65','1.37','103.8'],
  ['SK','SVK','Slovakia','Bratislava','Europe','Eastern Europe','EUR','Euro','+421','48.67','19.5'],
  ['SI','SVN','Slovenia','Ljubljana','Europe','Southern Europe','EUR','Euro','+386','46.12','14.82'],
  ['SB','SLB','Solomon Islands','Honiara','Oceania','Melanesia','SBD','Solomon Islands dollar','+677','-8.0','159.0'],
  ['SO','SOM','Somalia','Mogadishu','Africa','Eastern Africa','SOS','Somali shilling','+252','10.0','49.0'],
  ['ZA','ZAF','South Africa','Pretoria','Africa','Southern Africa','ZAR','South African rand','+27','-29.0','25.0'],
  ['SS','SSD','South Sudan','Juba','Africa','Eastern Africa','SSP','South Sudanese pound','+211','7.0','30.0'],
  ['ES','ESP','Spain','Madrid','Europe','Southern Europe','EUR','Euro','+34','40.0','-4.0'],
  ['LK','LKA','Sri Lanka','Colombo','Asia','Southern Asia','LKR','Sri Lankan rupee','+94','7.0','81.0'],
  ['SD','SDN','Sudan','Khartoum','Africa','Northern Africa','SDG','Sudanese pound','+249','15.0','30.0'],
  ['SR','SUR','Suriname','Paramaribo','Americas','South America','SRD','Surinamese dollar','+597','4.0','-56.0'],
  ['SE','SWE','Sweden','Stockholm','Europe','Northern Europe','SEK','Swedish krona','+46','62.0','15.0'],
  ['CH','CHE','Switzerland','Bern','Europe','Western Europe','CHF','Swiss franc','+41','47.0','8.0'],
  ['SY','SYR','Syria','Damascus','Asia','Western Asia','SYP','Syrian pound','+963','35.0','38.0'],
  ['TW','TWN','Taiwan','Taipei','Asia','Eastern Asia','TWD','New Taiwan dollar','+886','23.5','121.0'],
  ['TJ','TJK','Tajikistan','Dushanbe','Asia','Central Asia','TJS','Tajikistani somoni','+992','39.0','71.0'],
  ['TZ','TZA','Tanzania','Dodoma','Africa','Eastern Africa','TZS','Tanzanian shilling','+255','-6.0','35.0'],
  ['TH','THA','Thailand','Bangkok','Asia','South-Eastern Asia','THB','Thai baht','+66','15.0','100.0'],
  ['TL','TLS','Timor-Leste','Dili','Asia','South-Eastern Asia','USD','US Dollar','+670','-8.87','125.92'],
  ['TG','TGO','Togo','Lomé','Africa','Western Africa','XOF','West African CFA franc','+228','8.0','1.17'],
  ['TO','TON','Tonga','Nukualofa','Oceania','Polynesia','TOP','Tongan paʻanga','+676','-20.0','-175.0'],
  ['TT','TTO','Trinidad and Tobago','Port of Spain','Americas','Caribbean','TTD','Trinidad and Tobago dollar','+1868','11.0','-61.0'],
  ['TN','TUN','Tunisia','Tunis','Africa','Northern Africa','TND','Tunisian dinar','+216','34.0','9.0'],
  ['TR','TUR','Turkey','Ankara','Asia','Western Asia','TRY','Turkish lira','+90','39.0','35.0'],
  ['TM','TKM','Turkmenistan','Ashgabat','Asia','Central Asia','TMT','Turkmenistani manat','+993','40.0','60.0'],
  ['TV','TUV','Tuvalu','Funafuti','Oceania','Polynesia','AUD','Australian dollar','+688','-8.0','178.0'],
  ['UG','UGA','Uganda','Kampala','Africa','Eastern Africa','UGX','Ugandan shilling','+256','1.0','32.0'],
  ['UA','UKR','Ukraine','Kyiv','Europe','Eastern Europe','UAH','Ukrainian hryvnia','+380','49.0','32.0'],
  ['AE','ARE','United Arab Emirates','Abu Dhabi','Asia','Western Asia','AED','United Arab Emirates dirham','+971','24.0','54.0'],
  ['GB','GBR','United Kingdom','London','Europe','Northern Europe','GBP','British pound','+44','54.0','-2.0'],
  ['US','USA','United States','Washington D.C.','Americas','Northern America','USD','US Dollar','+1','38.0','-97.0'],
  ['UY','URY','Uruguay','Montevideo','Americas','South America','UYU','Uruguayan peso','+598','-33.0','-56.0'],
  ['UZ','UZB','Uzbekistan','Tashkent','Asia','Central Asia','UZS','Uzbekistani sum','+998','41.0','64.0'],
  ['VU','VUT','Vanuatu','Port Vila','Oceania','Melanesia','VUV','Vanuatu vatu','+678','-16.0','167.0'],
  ['VE','VEN','Venezuela','Caracas','Americas','South America','VES','Venezuelan bolívar','+58','8.0','-66.0'],
  ['VN','VNM','Vietnam','Hanoi','Asia','South-Eastern Asia','VND','Vietnamese đồng','+84','16.0','106.0'],
  ['YE','YEM','Yemen','Sanaa','Asia','Western Asia','YER','Yemeni rial','+967','15.5','47.5'],
  ['ZM','ZMB','Zambia','Lusaka','Africa','Eastern Africa','ZMW','Zambian kwacha','+260','-15.0','30.0'],
  ['ZW','ZWE','Zimbabwe','Harare','Africa','Eastern Africa','ZWL','Zimbabwean dollar','+263','-20.0','30.0'],
];

// Build a batched SQL INSERT with ON CONFLICT DO NOTHING
const batchSize = 50;
const batches = [];
for (let i = 0; i < countries.length; i += batchSize) {
  const batch = countries.slice(i, i + batchSize);
  const values = batch.map(c => 
    `('${c[0]}','${c[1]}','${c[2].replace(/'/g, "''")}','${c[3].replace(/'/g, "''")}','${c[4]}','${c[5]}','${c[6]}','${c[7].replace(/'/g, "''")}','${c[8]}','${c[9]}','${c[10]}',true)`
  ).join(',\n');
  batches.push(
    `INSERT INTO countries (code,iso3,name,capital_city,continent,region,currency_code,currency_name,phone_code,latitude,longitude,is_active) ` +
    `VALUES ${values} ON CONFLICT (code) DO UPDATE SET ` +
    `name=EXCLUDED.name, capital_city=EXCLUDED.capital_city, continent=EXCLUDED.continent, ` +
    `region=EXCLUDED.region, currency_code=EXCLUDED.currency_code, currency_name=EXCLUDED.currency_name, ` +
    `phone_code=EXCLUDED.phone_code, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, is_active=true`
  );
}

const conn = new Client();

async function runBatch(conn, sql, batchNum, total) {
  return new Promise((resolve, reject) => {
    const escaped = sql.replace(/'/g, `'\\''`);
    const cmd = `docker exec tour_ops_db psql -U postgres -d tourops -c '${escaped}'`;
    conn.exec(cmd, (err, stream) => {
      if (err) { reject(err); return; }
      let out = '';
      stream.on('data', d => out += d.toString());
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', () => {
        process.stdout.write(`  Batch ${batchNum}/${total}: ${out.trim()}\n`);
        resolve();
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('SSH ready, seeding all world countries...\n');
  try {
    for (let i = 0; i < batches.length; i++) {
      await runBatch(conn, batches[i], i + 1, batches.length);
    }
    // Final count
    await new Promise((resolve) => {
      conn.exec(`docker exec tour_ops_db psql -U postgres -d tourops -c "SELECT COUNT(*) as total FROM countries"`, (err, stream) => {
        if (err) { resolve(); return; }
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.on('close', resolve);
      });
    });
    console.log('\n✅ All countries seeded!');
  } catch(e) {
    console.error('Error:', e);
  }
  conn.end();
}).on('error', err => console.error('Connection error:', err))
.connect({
  host: '88.99.192.160', port: 2235,
  username: 'devteam', password: 'devteam73Sleep*', tryKeyboard: true
});
conn.on('keyboard-interactive', (_n,_i,_il,prompts,finish) => {
  finish(prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password') ? ['devteam73Sleep*'] : []);
});
