"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const safeURL=(u,pfx)=>{try{const s=String(u||"");if(/^(javascript|data|vbscript|blob):/i.test(s.trim()))return"#";const r=new URL(s,location.href);if(r.protocol!=="http:"&&r.protocol!=="https:")return"#";if(pfx&&!s.startsWith(pfx))return"#";return esc(s);}catch(e){return"#";}};
const safeLink=u=>safeURL(u);
const rel=ts=>{if(!ts)return"—";const s=Math.max(0,(Date.now()-ts)/1e3);if(s<60)return Math.floor(s)+"s ago";if(s<36e2)return Math.floor(s/60)+"m ago";if(s<864e2)return Math.floor(s/36e2)+"h ago";return Math.floor(s/864e2)+"d ago";};
const utc=d=>d.toISOString().slice(11,19);
const stamp=id=>{const t="Updated "+utc(new Date())+" UTC";$(id).textContent=t;$("footFresh").textContent=t;};
async function get(url,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms||15000);try{const r=await fetch(url,{signal:c.signal});clearTimeout(t);if(!r.ok)throw new Error(r.status);return r;}catch(e){clearTimeout(t);throw e;}}
function tick(){const d=new Date();$("utcTime").textContent="UTC "+utc(d);$("utcDate").textContent=d.toISOString().slice(0,10);}
setInterval(tick,1e3);tick();
const updNet=()=>document.body.classList.toggle("offline",!navigator.onLine);
addEventListener("online",updNet);addEventListener("offline",updNet);updNet();

/* ---------- STATE ---------- */
let map=null,quakeLayer=null,minorLayer=null,eonetLayer=null,tileLayer=null;
const TILE_URL="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",TILE_ATTR="Esri, HERE, Garmin, OpenStreetMap contributors | events: USGS, EMSC";
let quakes=[],minors=[],eonets=[],newsItems=[],newsCat="world",newsCache={};
let magFilter=4.5;
let qMarks=[],wxCache=[];
const MINOR_COLOR="#38bdf8";
const ECAT={severeStorms:{l:"Storm",c:"#38bdf8"},volcanoes:{l:"Volcano",c:"#ef4444"},floods:{l:"Flood",c:"#60a5fa"}};
const WMO={0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Icy fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",56:"Freezing drizzle",57:"Freezing drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",66:"Freezing rain",67:"Freezing rain",71:"Light snow",73:"Snow",75:"Heavy snow",77:"Snow grains",80:"Light showers",81:"Showers",82:"Violent showers",85:"Snow showers",86:"Snow showers",95:"Thunderstorm",96:"Storm + hail",99:"Storm + hail"};
const CITIES=[{n:"New York",lat:40.71,lon:-74.0},{n:"London",lat:51.5,lon:-0.12},{n:"Tokyo",lat:35.68,lon:139.69},{n:"Sydney",lat:-33.87,lon:151.21},{n:"Cairo",lat:30.04,lon:31.24},{n:"Mumbai",lat:19.08,lon:72.88},{n:"São Paulo",lat:-23.55,lon:-46.63},{n:"Singapore",lat:1.35,lon:103.82}];
/* ---------- MAP (Esri dark canvas, no key — fixed single-world view, no zoom/pan) ---------- */
const WORLD_BOUNDS=[[-85,-180],[85,180]];
function makeTiles(){return L.tileLayer(TILE_URL,{maxZoom:18,maxNativeZoom:16,keepBuffer:4,noWrap:true,bounds:WORLD_BOUNDS,attribution:TILE_ATTR});}
function fitMap(){
  if(!map)return;
  try{
    const el=$("map");
    const w=el.clientWidth||window.innerWidth;
    const z=Math.log2(w/256);
    map.setView([22,0],z,{animate:false});
  }catch(e){}
}
function initMap(){
  if(typeof L==="undefined"){$("map").style.display="none";$("mapFallback").style.display="block";return;}
  map=L.map("map",{worldCopyJump:false,zoomControl:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,boxZoom:false,keyboard:false,dragging:false,tapTolerance:24,zoomSnap:.001,zoomDelta:.25,maxBounds:WORLD_BOUNDS,maxBoundsViscosity:1.0}).setView([22,0],2);
  tileLayer=makeTiles();tileLayer.addTo(map);
  quakeLayer=L.layerGroup().addTo(map);minorLayer=L.layerGroup().addTo(map);eonetLayer=L.layerGroup().addTo(map);
  airLayer=L.layerGroup().addTo(map);aqiLayer=L.layerGroup().addTo(map);
  drawNight();
  map.on("mousemove",e=>{const c=$("coords");if(c)c.textContent=e.latlng.lat.toFixed(2)+"°, "+e.latlng.lng.toFixed(2)+"°";});
  fitMap();
  setTimeout(fitMap,300);
  let rT=null;const refit=()=>{try{map.invalidateSize();}catch(e){}clearTimeout(rT);rT=setTimeout(fitMap,150);};
  addEventListener("resize",refit);addEventListener("orientationchange",()=>setTimeout(refit,250));
}
const magColor=m=>m>=6?"#ef4444":m>=5.5?"#f59e0b":"#22c55e";
function drawAll(){
  if(!map)return;
  quakeLayer.clearLayers();minorLayer.clearLayers();eonetLayer.clearLayers();qMarks=[];
  quakes.filter(q=>q.mag>=magFilter).forEach(q=>{
    const mk=L.circleMarker([q.lat,q.lon],{radius:5+q.mag*1.8,color:magColor(q.mag),weight:2,fillColor:magColor(q.mag),fillOpacity:.6});
    mk.bindTooltip("M"+q.mag.toFixed(1)+" · "+esc(q.place)+" · "+rel(q.time),{className:"evtip",direction:"top",offset:[0,-8],sticky:true});
    mk.bindPopup("<b>M"+q.mag.toFixed(1)+"</b> · "+esc(q.place)+"<br>Depth "+q.depth.toFixed(0)+" km · "+rel(q.time)+"<br><a href='"+safeLink(q.url)+"' target='_blank' rel='noopener noreferrer'>USGS event page →</a>");
    quakeLayer.addLayer(mk);qMarks.push(mk);});
  minors.forEach(m=>{
    const mk=L.circleMarker([m.lat,m.lon],{radius:4.5,color:MINOR_COLOR,weight:1.5,fillColor:MINOR_COLOR,fillOpacity:.55});
    mk.bindTooltip("M"+m.mag.toFixed(1)+" · "+esc(m.place)+" · "+rel(m.time),{className:"evtip",direction:"top",offset:[0,-6],sticky:true});
    mk.bindPopup("<b>M"+m.mag.toFixed(1)+"</b> · "+esc(m.place)+"<br>Depth "+m.depth.toFixed(0)+" km · "+rel(m.time)+"<br>Source: EMSC real-time feed");
    minorLayer.addLayer(mk);});
  eonets.forEach(e=>{
    const meta=ECAT[e.cat]||{l:e.cat,c:"#a78bfa"};
    const mk=L.marker([e.lat,e.lon],{icon:L.divIcon({className:"",html:"<div class='dmk' style='--c:"+meta.c+"'></div>",iconSize:[15,15],iconAnchor:[8,8]})});
    mk.bindTooltip(esc(meta.l)+" · "+esc(e.title)+" · "+rel(e.time),{className:"evtip",direction:"top",offset:[0,-8],sticky:true});
    mk.bindPopup("<b>"+esc(e.title)+"</b><br>"+esc(meta.l)+" · "+rel(e.time)+"<br>"+e.lat.toFixed(2)+", "+e.lon.toFixed(2)+(e.src?"<br><a href='"+safeLink(e.src)+"' target='_blank' rel='noopener noreferrer'>Source →</a>":""));
    eonetLayer.addLayer(mk);});
  $("mapTitle").textContent="LIVE MAP · "+quakes.filter(q=>q.mag>=magFilter).length+" QUAKES · "+minors.length+" MICRO · "+eonets.length+" EVENTS";
}
/* all map layers always on — no toggles; feeds auto-refresh every 5 min (see BOOT) */
/* map data auto-refreshes; panel buttons refresh their own feeds */

/* ---------- QUAKES (USGS, real) ---------- */
async function loadQuakes(){
  
  try{
    const r=await get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",20000);
    const d=await r.json();
    quakes=(d.features||[]).map(f=>({mag:f.properties.mag||0,place:f.properties.place||"Unknown",time:f.properties.time,url:f.properties.url,lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],depth:f.geometry.coordinates[2]||0})).sort((a,b)=>b.mag-a.mag);
    drawAll();renderAlerts();renderEvList();stamp("freshEv");
    const pq=$("pulseQuake"),mx=quakes.reduce((a,q)=>q.mag>a?q.mag:a,0);
    if(pq)pq.innerHTML=quakes.length?("<b style='color:#fff'>"+quakes.length+"</b> quakes/24h · max <b style='color:var(--red)'>M"+mx.toFixed(1)+"</b>"):"";
  }catch(e){quakes=[];drawAll();renderAlerts();renderEvList();}
}

/* ---------- MICRO-QUAKES (EMSC real-time FDSN, real) ---------- */
async function loadMinor(){
  
  try{
    const t=new Date(),t0=new Date(t.getTime()-7*864e5),f=d=>d.toISOString().slice(0,10);
    const r=await get("https://www.seismicportal.eu/fdsnws/event/1/query?starttime="+f(t0)+"&endtime="+f(t)+"&minmagnitude=2.5&maxmagnitude=4.5&orderby=time&format=text&limit=150",25000);
    const txt=await r.text();minors=[];
    txt.split("\n").forEach(ln=>{ln=ln.trim();if(!ln||ln[0]==="#")return;const p=ln.split("|");
      const la=parseFloat(p[2]),lo=parseFloat(p[3]),mg=parseFloat(p[10]);
      if(!isFinite(la)||!isFinite(lo)||!isFinite(mg))return;
      minors.push({mag:mg,place:(p[12]||"Unknown").trim()||"Unknown",time:Date.parse(p[1])||Date.now(),lat:la,lon:lo,depth:parseFloat(p[4])||0});});
    minors.sort((a,b)=>b.time-a.time);
    drawAll();stamp("freshEv");
  }catch(e){minors=[];drawAll();}
}

/* ---------- STORMS + VOLCANOES (NASA EONET, real — service flaps, honest fallback) ---------- */
async function loadEonet(){
  
  try{
    const r=await get("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200",30000);
    const d=await r.json();
    eonets=[];
    (d.events||[]).forEach(e=>{
      const cat0=((e.categories||[])[0]||{}).id||"other";
      if(cat0==="wildfires")return;
      const g=(e.geometry||[]).filter(x=>x.type==="Point");
      if(!g.length)return;
      const last=g[g.length-1];
      eonets.push({title:e.title||"Untitled",cat:cat0,time:Date.parse(last.date)||Date.now(),lat:last.coordinates[1],lon:last.coordinates[0],src:((e.sources||[])[0]||{}).url||""});
    });
    eonets.sort((a,b)=>b.time-a.time);
    drawAll();renderAlerts();stamp("freshEv");
  }catch(e){eonets=[];drawAll();renderAlerts();}
}

/* ---------- ALERTS (derived from live feeds only) ---------- */
function renderAlerts(){
  const box=$("alertList");let h="";
  quakes.filter(q=>q.mag>=6).slice(0,3).forEach(q=>h+="<div class='alert HIGH' data-lat='"+q.lat+"' data-lon='"+q.lon+"'><div style='color:var(--red);font-size:10px;letter-spacing:1px'>HIGH · M"+q.mag.toFixed(1)+" QUAKE</div><div>"+esc(q.place)+"</div><small>"+rel(q.time)+" · USGS · <a href='"+safeLink(q.url)+"' target='_blank' rel='noopener noreferrer'>event →</a></small></div>");
  eonets.filter(e=>e.cat==="volcanoes").slice(0,2).forEach(e=>h+="<div class='alert HIGH' data-lat='"+e.lat+"' data-lon='"+e.lon+"'><div style='color:var(--red);font-size:10px;letter-spacing:1px'>HIGH · VOLCANO</div><div>"+esc(e.title)+"</div><small>"+rel(e.time)+" · NASA EONET</small></div>");
  quakes.filter(q=>q.mag>=5.5&&q.mag<6).slice(0,3).forEach(q=>h+="<div class='alert MEDIUM' data-lat='"+q.lat+"' data-lon='"+q.lon+"'><div style='color:var(--amber);font-size:10px;letter-spacing:1px'>MEDIUM · M"+q.mag.toFixed(1)+" QUAKE</div><div>"+esc(q.place)+"</div><small>"+rel(q.time)+" · USGS</small></div>");
  eonets.filter(e=>e.cat==="severeStorms").slice(0,2).forEach(e=>h+="<div class='alert MEDIUM' data-lat='"+e.lat+"' data-lon='"+e.lon+"'><div style='color:var(--amber);font-size:10px;letter-spacing:1px'>MEDIUM · STORM</div><div>"+esc(e.title)+"</div><small>"+rel(e.time)+" · NASA EONET</small></div>");
  if(!quakes.length)h="<div class='stateBox'><div class='big'>DATA SOURCE UNAVAILABLE</div>USGS feed unreachable.<br><br><button data-retry='quakes'>RETRY</button></div>";
  else if(!h)h="<div class='stateBox'><div class='big'>NO ACTIVE VERIFIED ALERTS</div>No M5.5+ quakes in the last 24h per USGS.</div>";
  box.innerHTML=h;
  box.querySelectorAll(".alert[data-lat]").forEach(el=>el.onclick=()=>{if(map)map.panTo([+el.dataset.lat,+el.dataset.lon],{animate:true,duration:1});});
  stamp("freshAlerts");
}
/* single quake list */
function renderEvList(){
  const box=$("evList");
  const list=quakes.filter(q=>q.mag>=magFilter);
  if(!quakes.length){box.innerHTML="<div class='stateBox'><div class='big'>NO DATA AVAILABLE</div>USGS feed failed to load.<br><br><button data-retry='quakes'>RETRY</button></div>";return;}
  box.innerHTML="<div style='padding:8px 14px;color:var(--dim);font-size:11px'>"+list.length+" events · M4.5+ / 24H · USGS</div>"+
    (list.slice(0,40).map(q=>"<div class='ev' data-lat='"+q.lat+"' data-lon='"+q.lon+"'><b style='color:"+magColor(q.mag)+"'>M"+q.mag.toFixed(1)+"</b> "+esc(q.place)+"<br><small>"+rel(q.time)+" · "+q.depth.toFixed(0)+" km deep</small></div>").join("")||"<div class='stateBox'><div class='big'>NONE ABOVE FILTER</div></div>");
  box.querySelectorAll(".ev").forEach((el,i)=>el.onclick=()=>{if(!map)return;map.panTo([+el.dataset.lat,+el.dataset.lon],{animate:true,duration:1});const mk=qMarks[i];if(mk)setTimeout(()=>{try{if(mk._map)mk.openPopup();}catch(e){}},1100);});
}

/* ---------- NEWS (BBC RSS, real) ---------- */
const FEEDS={world:{l:"BBC World",rss:"https://feeds.bbci.co.uk/news/world/rss.xml",site:"https://www.bbc.com/news/world"},africa:{l:"BBC Africa",rss:"https://feeds.bbci.co.uk/news/world/africa/rss.xml",site:"https://www.bbc.com/news/world/africa"},asia:{l:"BBC Asia",rss:"https://feeds.bbci.co.uk/news/world/asia/rss.xml",site:"https://www.bbc.com/news/world/asia"},europe:{l:"BBC Europe",rss:"https://feeds.bbci.co.uk/news/world/europe/rss.xml",site:"https://www.bbc.com/news/world/europe"},mideast:{l:"BBC Middle East",rss:"https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",site:"https://www.bbc.com/news/world/middle_east"},americas:{l:"BBC Americas",rss:"https://feeds.bbci.co.uk/news/world/latin_america/rss.xml",site:"https://www.bbc.com/news/world/latin_america"},business:{l:"BBC Business",rss:"https://feeds.bbci.co.uk/news/business/rss.xml",site:"https://www.bbc.com/news/business"},technology:{l:"BBC Technology",rss:"https://feeds.bbci.co.uk/news/technology/rss.xml",site:"https://www.bbc.com/news/technology"},science:{l:"BBC Science",rss:"https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",site:"https://www.bbc.com/news/science_and_environment"}};
$("feedSel").addEventListener("change",e=>{newsCat=e.target.value;renderNews(true);});
$("btnNewsRefresh").onclick=()=>renderNews(false);
async function loadFeed(cat){
  const f=FEEDS[cat];
  try{const r=await get("https://api.allorigins.win/raw?url="+encodeURIComponent(f.rss),15000);const t=await r.text();
    const doc=new DOMParser().parseFromString(t,"text/xml");if(doc.querySelector("parsererror"))throw 0;
    return[...doc.querySelectorAll("item")].slice(0,15).map(it=>({title:(it.querySelector("title")||{}).textContent||"Untitled",link:(it.querySelector("link")||{}).textContent||"#",source:f.l,ts:Date.parse((it.querySelector("pubDate")||{}).textContent||"")||Date.now()}));
  }catch(e){const r2=await get("https://api.rss2json.com/v1/api.json?rss_url="+encodeURIComponent(f.rss),15000);const d=await r2.json();
    if(d.status!=="ok"||!d.items)throw 0;
    return d.items.slice(0,15).map(it=>({title:it.title||"Untitled",link:it.link||"#",source:f.l,ts:Date.parse(it.pubDate||"")||Date.now()}));}
}
async function renderNews(useCache){
  const box=$("newsList");
  if(useCache&&newsCache[newsCat]){paintNews(newsCache[newsCat]);return;}
  box.innerHTML="<div class='stateBox'><div class='big'>LOADING...</div></div>";
  try{const items=await loadFeed(newsCat);newsCache[newsCat]={items,at:Date.now()};newsItems=items;paintNews(newsCache[newsCat]);stamp("freshNews");}
  catch(e){newsItems=[];
    box.innerHTML="<div class='stateBox'><div class='big'>DATA SOURCE UNAVAILABLE</div>RSS unreachable from this browser (network / CORS).<br><br><button data-retry='news'>RETRY</button> <a href='"+FEEDS[newsCat].site+"' target='_blank' rel='noopener noreferrer'>OPEN SOURCE →</a></div>";}
}
function paintNews(c){
  const box=$("newsList");
  if(!c.items.length){box.innerHTML="<div class='stateBox'><div class='big'>NO DATA AVAILABLE</div></div>";return;}
  box.innerHTML=c.items.map(n=>"<div class='newsItem'><span class='unreadDot'></span><h5>"+esc(n.title)+"</h5><small>"+esc(n.source)+" · "+rel(n.ts)+"</small></div>").join("");
  box.querySelectorAll(".newsItem").forEach((el,i)=>{const item=c.items[i];el.onclick=()=>{el.classList.add("read");const u=safeURL(item.link);if(u!=="#")open(u,"_blank","noopener");}});
  stamp("freshNews");$("freshNews").textContent+=" · "+c.items.length+" stories · "+FEEDS[newsCat].l;
}

/* ---------- WEATHER (Open-Meteo, batch + per-city fallback) ---------- */
function wxRow(r,i){
  return"<div class='wxrow"+(r.ok?" clickable":"")+"' "+(r.ok?"data-i='"+i+"'":"")+"><div><b>"+esc(r.city)+"</b><br><small>"+esc(r.sub)+"</small></div><div class='t'>"+(r.ok?Math.round(r.t)+"°":"—")+"</div></div>";
}
async function wxSingle(city){
  try{
    const r=await get("https://api.open-meteo.com/v1/forecast?latitude="+city.lat+"&longitude="+city.lon+"&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto",20000);
    const d=await r.json();const c=d.current||{};
    return{city:city.n,ok:true,t:c.temperature_2m,sub:(WMO[c.weather_code]||"—")+" · Wind "+(c.wind_speed_10m??"—")+" km/h · RH "+(c.relative_humidity_2m??"—")+"%",lat:city.lat,lon:city.lon};
  }catch(e){return{city:city.n,ok:false,sub:"unreachable"};}
}
async function loadWeather(){
  const box=$("wxList");
  box.innerHTML="<div class='stateBox'><div class='big'>LOADING...</div>Contacting Open-Meteo…</div>";
  try{
    const r=await get("https://api.open-meteo.com/v1/forecast?latitude="+CITIES.map(c=>c.lat).join(",")+"&longitude="+CITIES.map(c=>c.lon).join(",")+"&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto",20000);
    const d=await r.json();const arr=Array.isArray(d)?d:[d];
    if(!arr.length||!arr[0].current)throw 0;
    wxCache=arr.map((w,i)=>{const c=w.current||{};const city=CITIES[i]||{n:"?",lat:0,lon:0};
      return{city:city.n,ok:true,t:c.temperature_2m,sub:(WMO[c.weather_code]||"—")+" · Wind "+(c.wind_speed_10m??"—")+" km/h · RH "+(c.relative_humidity_2m??"—")+"%",lat:city.lat,lon:city.lon};});
    box.innerHTML=wxCache.map((r,i)=>wxRow(r,i)).join("");
    bindWxRows();
  }catch(e){
    box.innerHTML="<div class='stateBox'><div class='big'>BATCH FAILED — RETRYING PER CITY…</div></div>";
    wxCache=await Promise.all(CITIES.map(wxSingle));
    const ok=wxCache.filter(r=>r.ok).length;
    box.innerHTML=wxCache.map((r,i)=>wxRow(r,i)).join("");
    bindWxRows();
    if(ok<wxCache.length&&ok===0){box.innerHTML="<div class='stateBox'><div class='big'>DATA SOURCE UNAVAILABLE</div>Open-Meteo unreachable (batch + per-city failed).<br><br><button data-retry='weather'>RETRY</button></div>";}
  }
}
function bindWxRows(){$("wxList").querySelectorAll(".wxrow.clickable").forEach(el=>el.onclick=()=>{if(!map||typeof L==="undefined")return;const r=wxCache[+el.dataset.i];if(!r)return;map.panTo([r.lat,r.lon],{animate:true,duration:1});setTimeout(()=>L.popup().setLatLng([r.lat,r.lon]).setContent("<b>"+esc(r.city)+"</b><br>"+Math.round(r.t)+"°C · "+esc(r.sub)).openOn(map),1100);});}
$("btnWxRefresh").onclick=loadWeather;

/* ---------- MARKETS (real, honest fallback) ---------- */
async function loadMarkets(){
  const box=$("mktBody");let rows=[],fx=[];
  try{const r=await get("https://stooq.com/q/l/?s=^spx,^ndq,^dji&f=sd2t2ohlcv&h&e=json",15000);const d=await r.json();
    (d.symbols||[]).forEach(x=>{if(x.close&&x.open)rows.push({n:String(x.symbol).replace("^",""),p:Number(x.close).toFixed(2),ch:(x.close-x.open)/x.open*100});});}catch(e){}
  try{const r=await get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",15000);const d=await r.json();
    if(d.bitcoin)rows.push({n:"BTC",p:"$"+Number(d.bitcoin.usd).toLocaleString(),ch:d.bitcoin.usd_24h_change});
    if(d.ethereum)rows.push({n:"ETH",p:"$"+Number(d.ethereum.usd).toLocaleString(),ch:d.ethereum.usd_24h_change});}catch(e){}
  try{const r=await get("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,INR,CNY,KRW",15000);const d=await r.json();
    if(d.rates)Object.keys(d.rates).forEach(k=>fx.push({n:"USD→"+k,p:Number(d.rates[k]).toFixed(4),date:d.date}));}catch(e){}
  if(!rows.length&&!fx.length){box.innerHTML="<div class='stateBox'><div class='big'>MARKET DATA UNAVAILABLE</div>Quotes unreachable.<br><br><button data-retry='markets'>RETRY</button></div>";}
  else{
    let h="";
    if(fx.length)h+="<div style='padding:8px 14px 2px;color:var(--faint);font-size:10px;letter-spacing:1px'>FX · USD BASE · "+esc(fx[0].date||"")+" · FRANKFURTER</div>"+fx.map(f=>"<div class='wxrow'><span>"+esc(f.n)+"</span><span>"+esc(f.p)+"</span></div>").join("");
    if(rows.length)h+=rows.map(r=>"<div class='wxrow'><span>"+esc(r.n)+"</span><span>"+esc(r.p)+" <b style='color:"+(r.ch>=0?"var(--green)":"var(--red)")+"'>"+(r.ch>=0?"+":"")+Number(r.ch).toFixed(2)+"%</b></span></div>").join("");
    box.innerHTML=h;stamp("freshMkt");}
}

/* ---------- WORLD EVENT LOG (Wikipedia Current Events, real) ---------- */
let wikiItems=[];
$("btnWikiRefresh").onclick=loadWiki;
async function loadWiki(){
  const box=$("wikiList");
  box.innerHTML="<div class='stateBox'><div class='big'>LOADING...</div>Fetching Wikipedia current events…</div>";
  const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dates=[];for(let o=0;o>= -2;o--){const d=new Date(Date.now()+o*864e5);dates.push(d.getUTCFullYear()+" "+MONTHS[d.getUTCMonth()]+" "+d.getUTCDate());}
  for(const ds of dates){
    try{
      const r=await get("https://en.wikipedia.org/w/api.php?action=parse&page="+encodeURIComponent("Portal:Current events/"+ds)+"&prop=text&format=json&origin=*",20000);
      const d=await r.json();const html=(d.parse&&d.parse.text&&d.parse.text["*"])||"";
      if(!html)continue;
      const doc=new DOMParser().parseFromString(html,"text/html");
      const items=[];
      doc.querySelectorAll("ul > li").forEach(li=>{
        const txt=(li.textContent||"").replace(/\s+/g," ").trim();
        if(txt.length<60||txt.length>900)return;
        if(/^(edit|history|watch|read|view source)/i.test(txt))return;
        const a=li.querySelector("a[href^='/wiki/']");
        items.push({t:txt,l:a?"https://en.wikipedia.org"+a.getAttribute("href"):"https://en.wikipedia.org/wiki/Portal:Current_events"});
      });
      if(items.length){wikiItems=items.slice(0,14);
        box.innerHTML="<div style='padding:8px 14px;color:var(--dim);font-size:11px'>"+esc(ds)+" · WIKIPEDIA · EDITOR-CURATED</div>"+
          wikiItems.map(w=>"<div class='newsItem'><span class='unreadDot'></span><h5>"+esc(w.t).slice(0,280)+"</h5><small>Wikipedia current events</small></div>").join("");
        box.querySelectorAll(".newsItem").forEach((el,i)=>el.onclick=()=>{el.classList.add("read");const u=safeURL(wikiItems[i].l,"https://en.wikipedia.org");if(u!=="#")open(u,"_blank","noopener");});
        stamp("freshWiki");return;}
    }catch(e){/* try previous day */}
  }
  wikiItems=[];
  box.innerHTML="<div class='stateBox'><div class='big'>DATA SOURCE UNAVAILABLE</div>Wikipedia API unreachable.<br><br><button data-retry='wiki'>RETRY</button> <a href='https://en.wikipedia.org/wiki/Portal:Current_events' target='_blank' rel='noopener noreferrer'>OPEN PORTAL →</a></div>";
}

/* search removed for a minimal header; use panels + filters */

/* ---------- WORLD PULSE: clocks (local) + worldwide holidays (Nager) ---------- */
const ZONES=[["NEW YORK","America/New_York"],["LONDON","Europe/London"],["DUBAI","Asia/Dubai"],["MUMBAI","Asia/Kolkata"],["TOKYO","Asia/Tokyo"],["SYDNEY","Australia/Sydney"]];
let regionNames=null;try{regionNames=new Intl.DisplayNames(["en"],{type:"region"});}catch(e){}
const cname=c=>{try{return regionNames?regionNames.of(c):c;}catch(e){return c;}};
function tickPulse(){const el=$("clocks");if(!el)return;el.innerHTML=ZONES.map(z=>{try{const t=new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:z[1]}).format(new Date());return"<span style='margin-right:14px;white-space:nowrap'><b style='color:var(--faint);font-size:10px;letter-spacing:1px'>"+z[0]+"</b> <b style='color:#fff'>"+t+"</b></span>";}catch(e){return"";}}).join("");}
async function loadPulse(){
  tickPulse();setInterval(tickPulse,15000);
  try{const r=await get("https://date.nager.at/api/v3/NextPublicHolidaysWorldwide",20000);const d=await r.json();
    const h=(Array.isArray(d)?d:[]).slice(0,4);
    $("hol").innerHTML=h.length?h.map(x=>"<span style='margin-right:14px;white-space:nowrap'><b style='color:#fff'>"+esc(String(x.date||"").slice(5))+"</b> "+esc(String(x.name||"").slice(0,30))+" <b style='color:var(--faint)'>"+esc(cname(x.countryCode||""))+"</b></span>").join(""):"<span style='color:var(--dim)'>No upcoming worldwide holidays found.</span>";
  }catch(e){$("hol").innerHTML="<span style='color:var(--dim)'>Holiday feed unavailable.</span>";}
  stamp("freshPulse");
}

/* ---------- UPCOMING LAUNCHES (RocketLaunch.Live, real) ---------- */
let launches=[];
$("btnLaunchRefresh").onclick=loadLaunches;
function cdStr(t0){const s=(Date.parse(t0)-Date.now())/1e3;if(!isFinite(s)||s<0)return"TBD";const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return(d?d+"d ":"")+h+"h "+m+"m";}
async function loadLaunches(){
  const box=$("launchBody");
  try{
    const r=await get("https://fdo.rocketlaunch.live/json/launches/next/5",20000);
    const d=await r.json();launches=(d.result||[]).slice(0,5);
    if(!launches.length)throw 0;
    box.innerHTML=launches.map(l=>{const pad=(l.pad&&l.pad.location)||{};return"<div class='ev'><b style='color:var(--cyan)'>"+esc((l.vehicle&&l.vehicle.name)||"Vehicle")+"</b> · "+esc(String(l.name||"").slice(0,60))+"<br><small>"+esc(pad.name||"")+(pad.country?", "+esc(pad.country):"")+" · T-"+esc(cdStr(l.t0))+(l.weather_summary?" · "+esc(String(l.weather_summary).replace(/\s+/g," ").slice(0,64)):"")+"<br><a href='"+safeURL("https://rocketlaunch.live/launch/"+l.slug,"https://rocketlaunch.live/launch/")+"' target='_blank' rel='noopener noreferrer'>Details + stream →</a></small></div>";}).join("");
    stamp("freshLaunch");
    const nl=launches[0],pl=$("pulseLaunch");
    if(pl)pl.innerHTML=nl?("NEXT <b style='color:#fff'>"+esc(String((nl.vehicle&&nl.vehicle.name)||""))+"</b> · "+esc(String(nl.name||"").slice(0,34))+" · T-"+esc(cdStr(nl.t0))):"";
  }catch(e){launches=[];box.innerHTML="<div class='stateBox'><div class='big'>DATA SOURCE UNAVAILABLE</div>Launch feed unreachable.<br><br><button data-retry='launches'>RETRY</button></div>";}
}

/* ---------- NIGHT SHADING (computed live, always on) + ISS TRACKER (wheretheiss.at, real) ---------- */
let nightLayer=null,nightOn=true,issMarker=null,issFixes=[],issTrackLayer=null,issTimer=null;
/* ---------- ISS ORBIT MODEL (TLE + SGP4, long-range ±90min) ---------- */
// Local propagation via satellite.js: instant track on load (cached TLE),
// accurate full-orbit forecast, no per-tick network. wheretheiss.at stays
// as live anchor + fallback when TLE/CDN unavailable.
const ISS_RANGE_MIN=90,ISS_STEP_MIN=1,ISS_TLE_TTL_MS=12*3600*1000,ISS_TLE_MAX_AGE_MS=7*864e5;
const ISS_TLE_URLS=[
  "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE",
  "https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?CATNR=25544&FORMAT=TLE"
];
const ISS_TLE_JSON="https://celestrak.org/CCSDS/bulk.php?GROUP=stations&FORMAT=JSON";
// Bundled fallback (real ISS TLE, Sep 2026) — replaced by fresher cache/network when available.
const ISS_TLE_FALLBACK={l1:"1 25544U 98067A   26259.85263506  .00007068  00000+0  13566-3 0  9993",l2:"2 25544  51.6307 206.4210 0004838 147.2470 212.8820 15.49143506585961",at:0};
let issSatrec=null,issTLEAt=0,issTLESource="none";
function issHaveSGP4(){return typeof satellite!=="undefined"&&satellite&&typeof satellite.twoline2satrec==="function";}
function issSetTLE(l1,l2,at,src){
  if(!l1||!l2||l1[0]!=="1"||l2[0]!=="2")return false;
  if(!issHaveSGP4()){issTLEAt=at||Date.now();issTLESource=src||"cached";return false;}
  try{
    const rec=satellite.twoline2satrec(l1.trim(),l2.trim());
    if(!rec)return false;
    issSatrec=rec;issTLEAt=at||Date.now();issTLESource=src||"network";
    try{localStorage.setItem("argus-tle",JSON.stringify({l1:l1.trim(),l2:l2.trim(),at:issTLEAt}));}catch(e){}
    return true;
  }catch(e){return false;}
}
function issTLEAgeMs(){return issTLEAt?Date.now()-issTLEAt:Infinity;}
function restoreTLE(){
  if(!issHaveSGP4())return false;
  try{
    const c=JSON.parse(localStorage.getItem("argus-tle")||"null");
    if(c&&c.l1&&c.l2&&isFinite(c.at)&&Date.now()-c.at<ISS_TLE_MAX_AGE_MS){
      if(issSetTLE(c.l1,c.l2,c.at,"cache"))return true;
    }
  }catch(e){}
  issSetTLE(ISS_TLE_FALLBACK.l1,ISS_TLE_FALLBACK.l2,Date.now(),"bundled");
  return !!issSatrec;
}
function issPropagate(at){
  if(!issSatrec||!issHaveSGP4())return null;
  try{
    const d=at instanceof Date?at:new Date(at);
    const pv=satellite.propagate(issSatrec,d);
    if(!pv||!pv.position||!isFinite(pv.position.x))return null;
    const gmst=satellite.gstime(d);
    const g=satellite.eciToGeodetic(pv.position,gmst);
    const la=satellite.degreesLat(g.latitude),lo=satellite.degreesLong(g.longitude);
    if(!isFinite(la)||!isFinite(lo)||Math.abs(la)>90)return null;
    return{la,lo,alt:g.height};
  }catch(e){return null;}
}
async function loadTLE(){
  if(!issHaveSGP4())return;
  if(issTLEAt&&Date.now()-issTLEAt<ISS_TLE_TTL_MS&&issTLESource!=="bundled")return;
  for(const u of ISS_TLE_URLS){
    try{
      const r=await get(u,12000);const t=(await r.text()).trim();
      const lines=t.split("\n").map(s=>s.trim()).filter(Boolean);
      const l1=lines.find(s=>s[0]==="1"&&s.includes("25544")),l2=lines.find(s=>s[0]==="2"&&s.includes("25544"));
      if(l1&&l2&&issSetTLE(l1,l2,Date.now(),"celestrak")){drawTrack();tickISS();return;}
    }catch(e){/* try next */}
  }
  try{
    const r=await get(ISS_TLE_JSON,12000);const d=await r.json();
    const arr=Array.isArray(d)?d:(d.MEMBER||d.member||[]);
    const rec=arr.find(o=>String(o.NORAD_CAT_ID||o.noradCatId||o.id||"")=="25544"&&(o.TLE_LINE1||o.tle1));
    if(rec){
      const l1=rec.TLE_LINE1||rec.tle1,l2=rec.TLE_LINE2||rec.tle2;
      if(l1&&l2&&issSetTLE(l1,l2,Date.now(),"celestrak-json")){drawTrack();tickISS();return;}
    }
  }catch(e){}
}
function drawNight(){
  if(nightLayer&&map){map.removeLayer(nightLayer);nightLayer=null;}
  if(!nightOn||!map||typeof L==="undefined")return;
  const now=new Date();
  const utcH=now.getUTCHours()+now.getUTCMinutes()/60+now.getUTCSeconds()/3600;
  const doy=Math.floor((now-Date.UTC(now.getUTCFullYear(),0,0))/864e5);
  const dec=-23.44*Math.cos((360/365)*(doy+10)*Math.PI/180)*Math.PI/180;
  const sub=180-utcH*15,pts=[],td=Math.tan(dec)||1e-9;
  for(let lo=-180;lo<=180;lo+=2){const H=(lo-sub)*Math.PI/180;pts.push([Math.atan(-Math.cos(H)/td)*180/Math.PI,lo]);}
  const pl=dec>=0?-90:90;pts.push([pl,180],[pl,-180]);
  nightLayer=L.polygon(pts,{weight:0,fillColor:"#000",fillOpacity:.38,interactive:false}).addTo(map);
}
setInterval(()=>{drawNight();},300000);
function issIconHTML(){return "<div class='issWrap'><div class='issmk'></div><span class='issLbl'>ISS</span></div>";}
async function fetchISSPos(){
  const direct="https://api.wheretheiss.at/v1/satellites/25544";
  const proxy="https://api.allorigins.win/raw?url="+encodeURIComponent("https://api.wheretheiss.at/v1/satellites/25544");
  const fetchOne=async u=>{try{
    const r=await get(u,4000);const d=await r.json();
    const la=parseFloat(d.latitude),lo=parseFloat(d.longitude);
    if(!isFinite(la)||!isFinite(lo)||Math.abs(la)>90||Math.abs(lo)>180)return null;
    // Prefer satellite timestamp when present; fall back to receipt time.
    let t=Date.now();
    const ts=Number(d.timestamp);
    if(isFinite(ts)&&ts>0){
      const ms=ts<1e12?ts*1000:ts; // API returns seconds
      // Ignore absurd clock skew (>60s future or >5min past vs receipt)
      if(Math.abs(Date.now()-ms)<5*60*1000)t=ms;
    }
    return{la,lo,t};
  }catch(e){}return null;};
  // Staggered fallback: direct first, proxy only if direct is slow (>1.5s).
  // First winner resolves; the loser result is ignored (its own 4s timeout aborts it).
  return await new Promise(resolve=>{
    let settled=false;
    const win=pos=>{if(!settled&&pos){settled=true;resolve(pos);}};
    const fail=()=>{if(!settled){settled=true;resolve(null);}};
    let directDone=false,proxyDone=false,proxyFired=false;
    const maybeFail=()=>{if(directDone&&(!proxyFired||proxyDone))fail();};
    fetchOne(direct).then(pos=>{directDone=true;if(pos)win(pos);else if(proxyFired){/* wait proxy */}else{/* direct failed fast: fire proxy now */fireProxy();}maybeFail();});
    const fireProxy=()=>{if(proxyFired||settled)return;proxyFired=true;fetchOne(proxy).then(pos=>{proxyDone=true;if(pos)win(pos);else maybeFail();});};
    setTimeout(()=>{if(!settled&&!directDone)fireProxy();},1500);
    setTimeout(()=>{if(!settled)fail();},9000);
  });
}
function placeISSMarker(la,lo,live){
  if(!map||typeof L==="undefined")return;
  if(!issMarker)issMarker=L.marker([la,lo],{icon:L.divIcon({className:"",html:issIconHTML(),iconSize:[52,16],iconAnchor:[6,8]}),zIndexOffset:1000,interactive:true}).addTo(map);
  else{issMarker.setLatLng([la,lo]);issMarker.setIcon(L.divIcon({className:"",html:issIconHTML(),iconSize:[52,16],iconAnchor:[6,8]}));}
  issMarker.bindTooltip("ISS · "+la.toFixed(2)+"°, "+lo.toFixed(2)+"° · "+(live?"live":"predicted"),{className:"evtip",direction:"top",offset:[0,-10],sticky:true});
  const pi=$("pulseIss");if(pi)pi.innerHTML="<b style='color:#fff'>ISS</b> "+la.toFixed(1)+"°, "+lo.toFixed(1)+"° · "+(live?"live":"predicted");
}
function issAcceptableFix(prev,pos){
  if(!prev)return true;
  const dt=(pos.t-prev.t)/1000;
  if(!(dt>0))return false;
  if(dt>600)return true; // long gap: accept, vector logic will re-baseline
  // Raw apparent angular rate must be ISS-plausible; rejects teleports/bad fixes.
  const rawOm=fCentral(prev.la,prev.lo,pos.la,pos.lo)/dt;
  if(!isFinite(rawOm)||rawOm<0.0006||rawOm>0.0017)return false;
  return true;
}
async function trackISS(){
  if(!map||typeof L==="undefined"){issTimer=setTimeout(trackISS,15000);return;}
  try{
    const pos=await fetchISSPos();
    if(pos){
      const prev=issFixes.length?issFixes[issFixes.length-1]:null;
      if(prev&&pos.t<=prev.t)pos.t=prev.t+1000; // enforce monotonic time across direct/proxy mix
      if(issAcceptableFix(prev,pos)){
        issFixes.push({la:pos.la,lo:pos.lo,t:pos.t});issPrune();if(issFixes.length>24)issFixes.shift();
        issVector();
        try{localStorage.setItem("argus-iss",JSON.stringify({at:Date.now(),fixes:issFixes.slice(-6),vec:issVecS?{om:issVecS.om,brg:issVecS.brg}:null}));}catch(e){}
        placeISSMarker(pos.la,pos.lo,true);
        issMarker.bindPopup("<b>ISS</b> · live position<br>"+pos.la.toFixed(2)+", "+pos.lo.toFixed(2)+" · updated "+utc(new Date(pos.t))+" UTC<br>~28,000 km/h · ~420 km up · ±90 min orbit track<br>Source: wheretheiss.at live<br><a href='https://www.nasa.gov/international-space-station/' target='_blank' rel='noopener noreferrer'>NASA ISS →</a>");
        drawTrack();tickISS();
      }else{
        // Outlier rejected: don't poison vector/track, keep polling fast to recover.
        tickISS();
      }
    }else{
      const pi=$("pulseIss");if(pi&&!issFixes.length)pi.innerHTML="<b style='color:#fff'>ISS</b> feed unreachable — retrying…";
      else tickISS(); // keep gliding on last good vector while feed is down
    }
  }catch(e){}
  const span=issFixes.length>1?issFixes[issFixes.length-1].t-issFixes[0].t:0;
  clearTimeout(issTimer);
  // Poll fast until a valid track exists, then back off. SGP4 already gives a
  // full-orbit track, so live fixes are only calibration → poll slowly.
  if(issSatrec)issTimer=setTimeout(trackISS,!issTrackLayer?3000:15000);
  else issTimer=setTimeout(trackISS,!issTrackLayer?3000:issFixes.length<3?4000:span<90000?6000:12000);
}
/* Motion vector in an Earth-rotation-corrected (inertial-anchored) frame.
   Fixes are earth-fixed lat/lon, so fitting a raw great-circle to them and
   then subtracting earth rotation again drifts ~15 deg/hr of longitude.
   We anchor longitude at the newest fix: lo_inert(t) = lo_earth(t) +
   OM_EARTH*(t-T1), fit brg/om there, then convert predictions back with
   lo_earth = lo_inert - OM_EARTH*ts. Minimum 8s baseline (never 2s) and a
   tight om window so fix noise can't swing the ±60min line; a consistency
   gate keeps one noisy pair from jerking the smoothed vector. */
const OM_EARTH_DPS=15.0410686/3600; // sidereal deg per second
const ISS_OM_MIN=0.00085,ISS_OM_MAX=0.00135; // tight inertial rate window (~ISS 0.0011 rad/s)
let issVecS=null; // smoothed {F1,om,brg,at}
function issPrune(){const n=Date.now();while(issFixes.length>2&&n-issFixes[0].t>8*60*1000)issFixes.shift();while(issFixes.length>24)issFixes.shift();}
function issRawVector(){
  issPrune();
  if(issFixes.length<2)return null;
  const F1=issFixes[issFixes.length-1];
  const fit=(F0)=>{
    const dt=(F1.t-F0.t)/1000;if(!(dt>0)||!isFinite(dt))return null;
    const lo0i=F0.lo-OM_EARTH_DPS*dt; // F0 longitude in frame anchored at F1
    const om=fCentral(F0.la,lo0i,F1.la,F1.lo)/dt;
    if(!isFinite(om)||om<ISS_OM_MIN||om>ISS_OM_MAX)return null; // ISS ~= 0.0011 rad/s
    const brg=fBearing(F0.la,lo0i,F1.la,F1.lo);
    if(!isFinite(brg))return null;
    return{F1,om,brg,dt};
  };
  // 1) Accurate baseline 45-240s when available (fix noise amplifies over ±60min).
  for(let i=issFixes.length-2;i>=0;i--){const dt=(F1.t-issFixes[i].t)/1000;if(dt>=45&&dt<=240){const v=fit(issFixes[i]);if(v)return v;break;}}
  // 2) Usable baseline 15-45s once a few fixes exist.
  for(let i=issFixes.length-2;i>=0;i--){const dt=(F1.t-issFixes[i].t)/1000;if(dt>=15&&dt<45){const v=fit(issFixes[i]);if(v)return v;break;}}
  // 3) Minimum baseline >=8s. No 2s provisional: a 2s pair is pure noise
  // and draws a wildly wrong ±60min line after just 2 polls.
  for(let i=0;i<issFixes.length-1;i++){const dt=(F1.t-issFixes[i].t)/1000;if(dt>=8){const v=fit(issFixes[i]);if(v)return v;break;}}
  return null;
}
function issVector(){
  const raw=issRawVector();if(!raw)return issVecS;
  if(!issVecS||Date.now()-issVecS.at>5*60*1000||!isFinite(issVecS.om)||!isFinite(issVecS.brg)){issVecS={F1:raw.F1,om:raw.om,brg:raw.brg,at:Date.now()};return issVecS;}
  // Consistency gate: don't let one noisy pair swing the ±60min line.
  const omRatio=raw.om/issVecS.om;
  let dBrg=(raw.brg-issVecS.brg)*Math.PI/180;
  while(dBrg>Math.PI)dBrg-=2*Math.PI;while(dBrg<-Math.PI)dBrg+=2*Math.PI;
  if(omRatio<0.85||omRatio>1.18||Math.abs(dBrg)>25*Math.PI/180){
    // Keep old direction, just re-anchor to newest fix so the dot stays live.
    issVecS={F1:raw.F1,om:issVecS.om,brg:issVecS.brg,at:issVecS.at};
    return issVecS;
  }
  const w=0.35;
  const om=issVecS.om*(1-w)+raw.om*w;
  const a0=issVecS.brg*Math.PI/180,a1=raw.brg*Math.PI/180;
  let d=a1-a0;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
  const ab=a0+d*w;
  issVecS={F1:raw.F1,om,brg:((ab*180/Math.PI)+360)%360,at:Date.now()};
  return issVecS;
}
function issPredicted(v,at){
  if(!v||!v.F1)return null;
  const ts=(at-v.F1.t)/1000;
  if(Math.abs(ts)>75*60)return null;
  const p=fDest(v.F1.la,v.F1.lo,v.brg,v.om*ts);
  if(!isFinite(p[0])||!isFinite(p[1])||Math.abs(p[0])>90)return null;
  let ln=p[1]-OM_EARTH_DPS*ts;ln=((ln+540)%360)-180;
  return{la:p[0],lo:ln};
}
function restoreISS(){
  try{
    const c=JSON.parse(localStorage.getItem("argus-iss")||"null");
    // Only warm-start from very fresh state: ISS moves ~4°/min, so even a
    // few minutes stale draws the ±60min line tens of degrees off-track.
    if(!c||!Array.isArray(c.fixes)||!isFinite(c.at)||Date.now()-c.at>90*1000)return;
    const f=c.fixes.filter(x=>x&&isFinite(x.la)&&isFinite(x.lo)&&isFinite(x.t)&&Math.abs(x.la)<=90&&Math.abs(x.lo)<=180);
    if(f.length<2)return;
    // Require a usable baseline already, else wait for fresh fixes.
    if(f[f.length-1].t-f[0].t<8000)return;
    issFixes=f;issVecS=null;
    if(c.vec&&isFinite(c.vec.om)&&isFinite(c.vec.brg)&&c.vec.om>=ISS_OM_MIN&&c.vec.om<=ISS_OM_MAX)
      issVecS={F1:f[f.length-1],om:c.vec.om,brg:c.vec.brg,at:c.at};
    if(!issVector()){issFixes=[];issVecS=null;return;}
    drawTrack();tickISS();
  }catch(e){}
}
function clearISSTrack(){if(issTrackLayer&&map){try{map.removeLayer(issTrackLayer);}catch(e){}issTrackLayer=null;}}
function segsTrack(a,gapDeg){
  const gap=gapDeg||14,o=[[]];
  for(const p of a){
    const l=o[o.length-1];
    if(l.length&&Math.abs(p[1]-l[l.length-1][1])>180)o.push([p]);
    else l.push(p);
  }
  const out=[];
  for(const s of o){
    if(!s.length)continue;
    let run=[s[0]];
    for(let i=1;i<s.length;i++){
      const gp=Math.hypot(s[i][0]-s[i-1][0],s[i][1]-s[i-1][1]);
      if(gp>gap){if(run.length>1)out.push(run);run=[s[i]];}
      else run.push(s[i]);
    }
    if(run.length>1)out.push(run);
  }
  return out.filter(s=>s.length>1);
}
function tickISS(){
  if(!map||typeof L==="undefined")return;
  // Preferred: SGP4 live position (smooth, no network, works offline from cache).
  const sgp=issPropagate(Date.now());
  if(sgp&&issSatrec){
    const ageH=issTLEAgeMs()/36e5;
    const live=ageH<72;
    placeISSMarker(sgp.la,sgp.lo,live);
    const pi=$("pulseIss");
    if(pi)pi.innerHTML="<b style='color:#fff'>ISS</b> "+sgp.la.toFixed(1)+"°, "+sgp.lo.toFixed(1)+"° · live-TLE"+(issTLESource&&issTLESource!=="none"?" ("+esc(issTLESource)+")":"");
    issMarker.bindPopup("<b>ISS</b> · live orbit model<br>"+sgp.la.toFixed(2)+", "+sgp.lo.toFixed(2)+(isFinite(sgp.alt)?" · "+Math.round(sgp.alt)+" km up":"")+"<br>~28,000 km/h · ±90 min orbit track<br>Source: CelesTrak TLE ("+esc(issTLESource||"cached")+(isFinite(ageH)?", "+(ageH<1?(ageH*60).toFixed(0)+"m":ageH.toFixed(1)+"h")+" old":"")+")<br><a href='https://www.nasa.gov/international-space-station/' target='_blank' rel='noopener noreferrer'>NASA ISS →</a>");
    return;
  }
  const v=issVector();if(!v||!v.F1)return;
  const now=Date.now(),age=now-v.F1.t;
  if(age>3*60*1000){clearISSTrack();const pi=$("pulseIss");if(pi)pi.innerHTML="<b style='color:#fff'>ISS</b> stale — feed unreachable";return;}
  const p=issPredicted(v,now);if(!p)return;
  placeISSMarker(p.la,p.lo,age<25000);
}
const D2R=Math.PI/180,R2D=180/Math.PI;
function fCentral(a,b,c,d){const s=Math.sin((c-a)/2*D2R)**2+Math.cos(a*D2R)*Math.cos(c*D2R)*Math.sin((d-b)/2*D2R)**2;return 2*Math.asin(Math.min(1,Math.sqrt(s)));}
function fBearing(a,b,c,d){const y=Math.sin((d-b)*D2R)*Math.cos(c*D2R);const x=Math.cos(a*D2R)*Math.sin(c*D2R)-Math.sin(a*D2R)*Math.cos(c*D2R)*Math.cos((d-b)*D2R);return(Math.atan2(y,x)*R2D+360)%360;}
function fDest(a,b,brg,dist){const la=a*D2R,lo=b*D2R,t=brg*D2R;const la2=Math.asin(Math.sin(la)*Math.cos(dist)+Math.cos(la)*Math.sin(dist)*Math.cos(t));const lo2=lo+Math.atan2(Math.sin(t)*Math.sin(dist)*Math.cos(la),Math.cos(dist)-Math.sin(la)*Math.sin(la2));return[la2*R2D,((lo2*R2D+540)%360)-180];}
function drawTrack(){
  if(!map||typeof L==="undefined")return;
  // Preferred: SGP4 full-orbit track (±90min, 1min steps) — accurate for days.
  const now=Date.now();
  const sgp=issPropagate(now);
  if(sgp&&issSatrec){
    clearISSTrack();
    const past=[],near=[],far=[];
    for(let m=-ISS_RANGE_MIN;m<=ISS_RANGE_MIN;m+=ISS_STEP_MIN){
      const p=issPropagate(now+m*60000);
      if(!p||!isFinite(p.la)||!isFinite(p.lo)||Math.abs(p.la)>90)continue;
      let ln=((p.lo+540)%360)-180;
      const pt=[p.la,ln];
      if(m<=0)past.push(pt);
      else if(m<=60)near.push(pt);
      else far.push(pt);
    }
    issTrackLayer=L.layerGroup();
    segsTrack(past).forEach(s=>L.polyline(s,{color:"#5b6367",weight:1.5,dashArray:"4 4",interactive:false}).addTo(issTrackLayer));
    segsTrack(near).forEach(s=>L.polyline(s,{color:"#e8f4ff",weight:2,opacity:.9,interactive:false}).addTo(issTrackLayer));
    segsTrack(far).forEach(s=>L.polyline(s,{color:"#e8f4ff",weight:1.5,opacity:.4,dashArray:"2 5",interactive:false}).addTo(issTrackLayer));
    if(issTrackLayer.getLayers().length)issTrackLayer.addTo(map);
    return;
  }
  // Fallback: legacy 2-fix vector (±60min) when TLE/CDN unavailable.
  const v=issVector();if(!v||!v.F1)return;
  if(Date.now()-v.F1.t>3*60*1000){clearISSTrack();return;}
  clearISSTrack();
  const F1=v.F1;
  const past=[],fut=[];
  for(let m=-60;m<=60;m+=2){
    const ts=m*60,p=fDest(F1.la,F1.lo,v.brg,v.om*ts);
    if(!isFinite(p[0])||!isFinite(p[1])||Math.abs(p[0])>75)continue; // ISS never exceeds ~51.6°; beyond that the vector is bad
    let ln=p[1]-OM_EARTH_DPS*ts;ln=((ln+540)%360)-180;
    if(!isFinite(ln))continue;
    (m<=0?past:fut).push([p[0],ln]);
  }
  // Split on antimeridian jumps AND on gaps left by rejected points, so a bad
  // vector can't draw one long chord across the map.
  const segs=a=>segsTrack(a,14);
  issTrackLayer=L.layerGroup();
  segs(past).forEach(s=>L.polyline(s,{color:"#5b6367",weight:1.5,dashArray:"4 4",interactive:false}).addTo(issTrackLayer));
  segs(fut).forEach(s=>L.polyline(s,{color:"#e8f4ff",weight:2,opacity:.85,interactive:false}).addTo(issTrackLayer));
  issTrackLayer.addTo(map);
}
setInterval(tickISS,2000);
setInterval(()=>{drawTrack();},30000);
setInterval(()=>{loadTLE();},6*3600*1000);
/* ISS polling self-schedules inside trackISS (3s burst until track draws, then 4s/6s/12s); tickISS glides the dot every 2s between fixes */

/* ---------- AIRPORT WEATHER (aviationweather.gov METAR, real) ---------- */
const AIRPORTS=[{icao:"KJFK",n:"New York JFK",lat:40.64,lon:-73.78},{icao:"EGLL",n:"London Heathrow",lat:51.47,lon:-0.45},{icao:"OMDB",n:"Dubai",lat:25.25,lon:55.36},{icao:"VIDP",n:"Delhi",lat:28.57,lon:77.10},{icao:"RJTT",n:"Tokyo Haneda",lat:35.55,lon:139.78},{icao:"YSSY",n:"Sydney",lat:-33.95,lon:151.18},{icao:"FACT",n:"Cape Town",lat:-33.97,lon:18.60},{icao:"SBGR",n:"São Paulo",lat:-23.44,lon:-46.47},{icao:"HECA",n:"Cairo",lat:30.12,lon:31.41},{icao:"WSSS",n:"Singapore",lat:1.36,lon:103.99}];
let airLayer=null,aqiLayer=null;
async function loadAir(){
  if(!map||typeof L==="undefined")return;
  if(!airLayer){airLayer=L.layerGroup();}if(!map.hasLayer(airLayer))airLayer.addTo(map);
  try{
    const r=await get("https://api.open-meteo.com/v1/forecast?latitude="+AIRPORTS.map(a=>a.lat).join(",")+"&longitude="+AIRPORTS.map(a=>a.lon).join(",")+"&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto",25000);
    const d=await r.json();const arr=Array.isArray(d)?d:[d];
    if(!arr.length||!arr[0].current)throw 0;
    airLayer.clearLayers();
    arr.forEach((w,i)=>{const c=w.current||{},ap=AIRPORTS[i]||{icao:"?",n:"?",lat:0,lon:0};
      const mk=L.circleMarker([ap.lat,ap.lon],{radius:4,color:"#38bdf8",weight:1.5,fillColor:"#0e1112",fillOpacity:.95});
      mk.bindTooltip(ap.icao+" · "+Math.round(c.temperature_2m)+"°C · "+(WMO[c.weather_code]||""),{className:"evtip",direction:"top",offset:[0,-6],sticky:true});
      mk.bindPopup("<b>"+ap.icao+"</b> · "+ap.n+"<br>"+Math.round(c.temperature_2m)+"°C · "+(WMO[c.weather_code]||"—")+"<br>Wind "+(c.wind_direction_10m==null?"—":c.wind_direction_10m+"°")+"/"+(c.wind_speed_10m==null?"—":c.wind_speed_10m+" km/h")+"<br>Source: Open-Meteo live");
      airLayer.addLayer(mk);});
  }catch(e){return;}
}

/* ---------- AIR QUALITY (Open-Meteo, real) ---------- */
const AQICITIES=[{n:"Los Angeles",lat:34.05,lon:-118.24},{n:"Mexico City",lat:19.43,lon:-99.13},{n:"Paris",lat:48.85,lon:2.35},{n:"Lagos",lat:6.52,lon:3.37},{n:"Jakarta",lat:-6.21,lon:106.85},{n:"Beijing",lat:39.9,lon:116.4},{n:"Moscow",lat:55.76,lon:37.62},{n:"Johannesburg",lat:-26.2,lon:28.04}];
const AQIB=[[50,"#22c55e","Good"],[100,"#eab308","Moderate"],[150,"#fb923c","USG"],[200,"#ef4444","Unhealthy"],[300,"#a78bfa","Very unhealthy"],[1e9,"#7f1d1d","Hazardous"]];
function aqiMeta(v){if(v==null||!isFinite(v))return{c:"#6b7280",l:"unknown"};for(const b of AQIB)if(v<=b[0])return{c:b[1],l:b[2]};return{c:"#7f1d1d",l:"Hazardous"};}
async function loadAQI(){
  if(!map||typeof L==="undefined")return;
  if(!aqiLayer){aqiLayer=L.layerGroup();}if(!map.hasLayer(aqiLayer))aqiLayer.addTo(map);
  try{
    const r=await get("https://air-quality-api.open-meteo.com/v1/air-quality?latitude="+AQICITIES.map(c=>c.lat).join(",")+"&longitude="+AQICITIES.map(c=>c.lon).join(",")+"&current=us_aqi,pm2_5&timezone=auto",25000);
    const d=await r.json();const arr=Array.isArray(d)?d:[d];
    if(!arr.length||!arr[0].current)throw 0;
    aqiLayer.clearLayers();
    arr.forEach((w,i)=>{const c=w.current||{},ct=AQICITIES[i]||{n:"?",lat:0,lon:0},m=aqiMeta(c.us_aqi);
      const mk=L.circleMarker([ct.lat,ct.lon],{radius:4,color:m.c,weight:2,fillColor:"#0e1112",fillOpacity:.95});
      mk.bindTooltip("AQI "+(c.us_aqi==null?"—":Math.round(c.us_aqi))+" · "+m.l,{className:"evtip",direction:"top",offset:[0,-6],sticky:true});
      mk.bindPopup("<b>"+ct.n+"</b> · air quality<br>US AQI <b style='color:"+m.c+"'>"+(c.us_aqi==null?"—":Math.round(c.us_aqi))+" · "+m.l+"</b><br>PM2.5 "+(c.pm2_5==null?"—":c.pm2_5)+" µg/m³<br>Source: Open-Meteo live");
      aqiLayer.addLayer(mk);});
  }catch(e){return;}
}

/* ---------- ABOUT + SHORTCUTS ---------- */
$("btnAbout").onclick=()=>{$("aboutModal").style.display="flex";};
$("aboutClose").onclick=()=>{$("aboutModal").style.display="none";};
$("aboutModal").addEventListener("click",e=>{if(e.target===$("aboutModal"))$("aboutModal").style.display="none";});
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("aboutModal").style.display="none";});

/* ---------- BOOT: ISS + map-critical feeds first, slow/heavy feeds deferred ---------- */
initMap();restoreTLE();restoreISS();
if(issSatrec){drawTrack();tickISS();}
trackISS();loadTLE();
{const pi=$("pulseIss");if(pi&&!issFixes.length&&!issTrackLayer&&!issSatrec)pi.innerHTML="<b style='color:#fff'>ISS</b> acquiring signal…";}
loadQuakes();loadAir();loadAQI();renderNews(false);loadWeather();
setTimeout(()=>{loadMinor();loadEonet();},500); // slow 25-30s feeds: don't head-of-line-block ISS
setTimeout(()=>{loadMarkets();loadWiki();loadPulse();loadLaunches();},1500);
setInterval(()=>{loadQuakes();loadMinor();loadEonet();loadAir();loadAQI();},300000);
setInterval(()=>{if(newsCache[newsCat]&&Date.now()-newsCache[newsCat].at>6e5)$("freshNews").textContent+=" · STALE";},3e4);

/* ---------- RETRY delegation (CSP-strict: no inline onclick) ---------- */
document.addEventListener("click",e=>{
  const b=e.target&&e.target.closest?e.target.closest("[data-retry]"):null;
  if(!b)return;
  const k=b.getAttribute("data-retry");
  if(k==="reload")location.reload();
  else if(k==="quakes"){try{loadQuakes();}catch(_){}}
  else if(k==="news"){try{renderNews(false);}catch(_){}}
  else if(k==="weather"){try{loadWeather();}catch(_){}}
  else if(k==="markets"){try{loadMarkets();}catch(_){}}
  else if(k==="wiki"){try{loadWiki();}catch(_){}}
  else if(k==="launches"){try{loadLaunches();}catch(_){}}
});
