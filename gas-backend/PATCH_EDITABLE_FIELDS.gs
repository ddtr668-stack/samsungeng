// ============================================================
// [PATCH] 현장설치정보(siteInfo·S열) + 도면(drawing·R열) 저장 허용
// ------------------------------------------------------------
// ▶ 적용 방법:
//   1) 기존 DashboardApi.gs 파일에서 `var EDITABLE_FIELDS_ = { ... };`
//      블록을 찾아, 아래 블록으로 통째로 교체 하세요.
//      (마지막 줄에 drawing / siteInfo 두 항목이 추가되었습니다.)
//   2) 저장 후 "배포 → 배포 관리 → ✏️편집 → 새 버전" 을 선택해
//      재배포합니다. 웹 앱 URL 은 그대로 유지됩니다.
// ------------------------------------------------------------
// ※ 이 파일은 붙여넣기용 스니펫입니다.
//   그대로 GAS 프로젝트에 추가해도 무해하지만(변수 재선언 오류만 주의),
//   실제로는 DashboardApi.gs 내부의 동일 변수만 교체하는 것을 권장합니다.
// ============================================================

var EDITABLE_FIELDS_ = {
  category:'category', client:'client', projectName:'projectName',
  totalAmount:'totalAmount', paidAmount:'paidAmount',
  taxInvoiceIssued:'taxInvoiceIssued', taxInvoicePending:'taxInvoicePending',
  productCost:'productCost', subcontractor:'subcontractor',
  subcontractAmount:'subcontractAmount', subcontractPaid:'subcontractPaid',
  incidental:'incidental', salesCost:'salesCost',
  status:'status', progress:'progress', note:'note',
  chk배관:'chk배관', chk실내기:'chk실내기', chk실외기:'chk실외기',
  chk시운전:'chk시운전', chk인수인계:'chk인수인계',
  contractDate:'contractDate',
  drawing:'drawing',      // ← R열 (도면 Drive 링크)     [NEW]
  siteInfo:'siteInfo'     // ← S열 (현장설치정보 텍스트)  [NEW]
};
