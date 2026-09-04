const API = 'http://localhost:8080'
const sid = 1
const j = async (u) => (await fetch(`${API}${u}`)).json()
const t = async (u) => (await fetch(`${API}${u}`)).text()
const cells = (line) => { const o=[];let c='',q=false
  for (let i=0;i<line.length;i++){const ch=line[i]
    if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++}else q=!q}
    else if(ch===','&&!q){o.push(c);c=''}else c+=ch}
  o.push(c);return o }
const parts = (x)=>{const ls=x.trim().split('\n');const h=ls.findIndex(l=>!l.startsWith('#'))
  return {header:ls[h],rows:ls.slice(h+1)}}
const col=(p,n)=>{const a=cells(p.header).indexOf(n);return a<0?[]:p.rows.map(r=>cells(r)[a])}
const m=(a,b)=>{const R=6371000,dLat=(b[1]-a[1])*Math.PI/180,dLon=(b[0]-a[0])*Math.PI/180
  const l1=a[1]*Math.PI/180,l2=b[1]*Math.PI/180
  const h=Math.sin(dLat/2)**2+Math.cos(l1)*Math.cos(l2)*Math.sin(dLon/2)**2
  return 2*R*Math.asin(Math.sqrt(h))}
const lines = await j(`/api/sessions/${sid}/serving-lines`)
const csv = parts(await t(`/api/sessions/${sid}/export.csv?result=serving-lines`))
const geo = await j(`/api/sessions/${sid}/export.geojson?result=serving-lines`)
const stated = col(csv,'metres').map(Number)
const drawn = geo.features.map(f=>m(...f.geometry.coordinates))
const worst = drawn.length===stated.length&&stated.length>0
  ? Math.max(...drawn.map((v,i)=>Math.abs(v-stated[i]))) : Infinity
console.log('line is the line it says:',
  lines.length>0 && csv.rows.length===lines.length && geo.features.length===lines.length
  && geo.features.every(f=>f.geometry.type==='LineString'&&f.geometry.coordinates.length===2)
  && worst<1, `(worst ${worst.toFixed(3)} m over ${lines.length} lines)`)
