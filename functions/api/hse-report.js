// Read-only, aggregated KPI / annual HSE plan feed for HSE Executive.
// The sole source is AESCON_SGE_Safety_V2. No PII or source-row edits.
const SOURCE_ID = '1c9_PruBryWnxW-0cW1Xpx2ygE23ZmW30OcdGONn2wL8';
const BASE = 'https://docs.google.com/spreadsheets/d/' + SOURCE_ID + '/gviz/tq';
const TABS = ['DB_HSE_KPI', 'DB_Annual_HSE_Result', 'DB_Annual_HSE_Plan_2570'];

async function tabRows(sheet) {
  const u = BASE + '?tqx=out:json&sheet=' + encodeURIComponent(sheet);
  const response = await fetch(u, { headers: { 'Accept':'text/plain' }, cf: { cacheTtl: 60, cacheEverything: true } });
  if (!response.ok) throw new Error(sheet + ' HTTP ' + response.status);
  const t = await response.text();
  const start = t.indexOf('setResponse(');
  if (start < 0) throw new Error(sheet + ' missing data response');
  const from = start + 'setResponse('.length;
  const end = t.lastIndexOf(');');
  if (end < from) throw new Error(sheet + ' malformed data');
  const data = JSON.parse(t.slice(from,end));
  if (data.status !== 'ok') throw new Error(sheet + ' ' + (data.status||'invalid'));
  const cols = data.table.cols.map((x,i) => (x.label||x.id||String(i)).trim());
  return data.table.rows.map(row => Object.fromEntries(cols.map((key,i) => [key, row.c[i] ? row.c[i].v : null])));
}
const n = x => Number(x) || 0;
const round = x => Math.round(x * 100) / 100;
const statuses = a => a.reduce((m,x) => { const k=String(x.Status||'ไม่ระบุ');m[k]=(m[k]||0)+1; return m },{});
const percent=(part,total)=>total ? round(part/total*100):null;

export async function onRequestGet({ request }) {
  try {
    const [kpiRows,actualRows,planRows] = await Promise.all(TABS.map(tabRows));
    const monthly=kpiRows.filter(r=>Number(r.Year)===2026 && Number(r.Month)>=1 && Number(r.Month)<=12 && ['SGE','AESCON'].includes(r.Company));
    const plan2569=actualRows.filter(r=>['SGE','AESCON'].includes(r.Company) && (r.PlanYear == null || String(r.PlanYear)==='2569')); // GViz infers mixed PlanYear cells as null; this tab contains only 2569 records
    const plan2570=planRows.filter(r=>String(r.PlanYear)==='2570' && ['SGE','AESCON'].includes(r.Company));
    const kpi={};
    const planActual={};
    const planDraft={};
    for (const company of ['SGE','AESCON']) {
      const rows=monthly.filter(x=>x.Company===company).sort((a,b)=>n(a.Month)-n(b.Month));
      const sum=field=>rows.reduce((t,x)=>t+n(x[field]),0);
      const trainPlan=sum('TrainingPlan'),trainActual=sum('TrainingActual');
      const docPlan=sum('DocumentPlan'),docActual=sum('DocumentActual');
      const actionPlan=sum('ActionPlanTotal'),actionClosed=sum('ActionPlanClosed');
      const safetyBudget=sum('SafetyBudget'),costPpe=sum('ActualPPECost'),costTraining=sum('ActualTrainingCost');
      kpi[company]={
        year:2569,throughMonth:Math.max(0,...rows.map(x=>n(x.Month))),months:rows.map(x=>n(x.Month)),
        training:{plan:trainPlan,actual:trainActual,pct:percent(trainActual,trainPlan)},
        documents:{plan:docPlan,actual:docActual,pct:percent(docActual,docPlan)},
        action:{plan:actionPlan,recorded:actionClosed,pct:percent(actionClosed,actionPlan)},
        costs:{budget:round(safetyBudget),ppe:round(costPpe),training:round(costTraining),total:round(costPpe+costTraining),pct:percent(costPpe+costTraining,safetyBudget)}
      };
      const results=plan2569.filter(x=>x.Company===company);
      const statusCounts=statuses(results);
      planActual[company]={total:results.length,completed:(statusCounts['เสร็จตามแผน']||0)+(statusCounts['เสร็จก่อนแผน']||0)+(statusCounts['เสร็จล่าช้า']||0),statusCounts,source:'DB_Annual_HSE_Result'};
      const plans=plan2570.filter(x=>x.Company===company);
      planDraft[company]={total:plans.length,budget:round(plans.reduce((t,x)=>t+n(x.BudgetPlan),0)),pendingApproval:plans.filter(x=>x.ApprovalStatus==='รออนุมัติ').length};
    }
    const safePlans=plan2570.map(x=>({c:x.Company,no:String(x.Seq||''),cat:String(x.Category||''),name:String(x.Activity||''),owner:String(x.Responsible||''),budget:n(x.BudgetPlan),months:String(x.PlannedMonths||''),status:String(x.ApprovalStatus||'รออนุมัติ')}));
    return new Response(JSON.stringify({ok:true,source:'AESCON_SGE_Safety_V2',generatedAt:new Date().toISOString(),kpi,plan2569:planActual,plan2570Summary:planDraft,plan2570:safePlans}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60','access-control-allow-origin':'*','x-content-type-options':'nosniff'}});
  } catch(e) {
    return new Response(JSON.stringify({ok:false,error:'Unable to read verified HSE source',detail:String(e.message||e)}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
}
