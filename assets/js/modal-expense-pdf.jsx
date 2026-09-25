/* ═══════════════════════════════════════════════════════════════
   지출품의서 · 인쇄용 HTML 빌더 (개선안 ⑧ PDF 다중 페이지)
   - 브라우저 window.print() 로 프린트/PDF 저장
   - 4페이지 구성:
     1p 표지 (결재란 + 계약개요 + 지급대상 + 기성진행 + 총액 + 비고)
     2p 설치비 내역서
     3p 제품 내역서 (장비대)  · 항목 없으면 생략
     4p 기타경비 + 영업수수료 · 둘 다 없으면 생략
═══════════════════════════════════════════════════════════════ */

(function () {
  const _num = (v) => (Math.round(Number(v) || 0)).toLocaleString('ko-KR');
  const _esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const CSS_PRINT = `
    * { box-sizing: border-box; }
    @page { size: A4; margin: 15mm; }
    body {
      font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
      color: #000; font-size: 10.5pt; line-height: 1.5;
      margin: 0; padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .page {
      page-break-after: always;
      padding: 0;
      position: relative;
    }
    .page:last-child { page-break-after: auto; }
    h1.doc-title {
      font-size: 22pt; letter-spacing: 0.4em;
      text-align: center; font-weight: 800;
      padding-bottom: 8pt; margin: 0 0 14pt;
      border-bottom: 2.5pt solid #000;
    }
    h1.doc-title .sub {
      display: block; font-size: 9pt; letter-spacing: 0.02em;
      color: #666; margin-top: 4pt; font-weight: 500;
    }
    h2.page-title {
      font-size: 14pt; font-weight: 800;
      text-align: center; margin: 0 0 8pt;
      padding-bottom: 6pt; border-bottom: 1.2pt solid #000;
    }
    h2.page-title .sub {
      display: block; font-size: 8.5pt; font-weight: 500;
      color: #666; margin-top: 2pt;
    }

    /* 결재란 */
    .approval {
      display: grid; grid-template-columns: 55pt repeat(3, 1fr);
      border: 1pt solid #000; margin-bottom: 12pt;
      font-size: 9pt;
    }
    .approval > div { border-right: 1pt solid #000; }
    .approval > div:last-child { border-right: 0; }
    .approval .label-cell {
      padding: 6pt; text-align: center; font-weight: 700;
      background: #f5f5f5; display: flex; align-items: center; justify-content: center;
      writing-mode: vertical-lr;
    }
    .approval .role-box .role {
      padding: 3pt; text-align: center; font-weight: 700;
      background: #f5f5f5; border-bottom: 1pt solid #000; font-size: 8.5pt;
    }
    .approval .role-box .sign { height: 36pt; }

    /* 섹션 헤더 */
    .sec-title {
      font-size: 10pt; font-weight: 700;
      border-bottom: 1pt solid #000;
      padding-bottom: 2pt; margin-bottom: 5pt;
    }
    table.info {
      width: 100%; border-collapse: collapse;
      font-size: 9pt; margin-bottom: 10pt;
    }
    table.info td {
      padding: 4pt 6pt; border: 0.8pt solid #999;
      vertical-align: middle;
    }
    table.info td.k {
      background: #f5f5f5; font-weight: 700; width: 22%;
      font-size: 8.5pt;
    }
    table.info td.v { font-size: 9pt; }
    table.info td.v.strong { font-weight: 700; font-size: 10pt; }

    /* 항목 테이블 */
    table.items {
      width: 100%; border-collapse: collapse;
      font-size: 8.5pt; margin-bottom: 6pt;
    }
    table.items th, table.items td {
      padding: 4pt 5pt; border: 0.8pt solid #999;
      vertical-align: middle;
    }
    table.items th {
      background: #f0f0f0; font-weight: 700;
      font-size: 8pt; letter-spacing: 0.02em;
    }
    table.items td.num, table.items th.num { text-align: right; font-variant-numeric: tabular-nums; }
    table.items td.ctr, table.items th.ctr { text-align: center; }
    table.items tr.total td {
      background: #f5f5f5; font-weight: 700;
      border-top: 1.2pt solid #000;
    }

    /* 요약 배너 (제품) */
    .product-summary {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 4pt;
      margin-bottom: 6pt; font-size: 8pt;
    }
    .product-summary > div {
      padding: 4pt 6pt; border: 0.8pt solid #999; background: #f5f5f5;
    }
    .product-summary > div.hi { background: #fff9d6; border-color: #000; font-weight: 700; }
    .product-summary .lbl { color: #666; font-size: 7.5pt; }
    .product-summary .val { font-weight: 700; font-size: 10pt; margin-top: 1pt; }

    /* 금회 지급 총액 (강조 박스) */
    .grand-total {
      padding: 8pt 10pt; background: #fff9d6;
      border: 2pt solid #000; text-align: center;
      margin: 10pt 0;
    }
    .grand-total .lbl { font-size: 8.5pt; letter-spacing: 0.05em; }
    .grand-total .val {
      font-size: 15pt; font-weight: 800; margin-top: 2pt;
      font-variant-numeric: tabular-nums;
    }
    .grand-total .breakdown {
      font-size: 7.5pt; color: #666; margin-top: 3pt;
    }

    /* 비고 박스 */
    .note-box {
      padding: 5pt 7pt; border: 0.8pt solid #999;
      min-height: 40pt; font-size: 9pt;
      white-space: pre-wrap;
    }

    /* 페이지 번호 */
    .page-num {
      position: absolute; bottom: 0; right: 0;
      font-size: 7.5pt; color: #999;
    }

    @media screen {
      body { background: #F3F3EE; padding: 20px 0; }
      .page {
        background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        width: 210mm; min-height: 297mm; margin: 0 auto 20px;
        padding: 15mm;
      }
    }
  `;

  function pageWrap(pageNo, totalPages, inner) {
    return `<div class="page">${inner}<div class="page-num">${pageNo} / ${totalPages}</div></div>`;
  }

  function buildPage1({ contract, payload }) {
    return `
      <h1 class="doc-title">
        지 출 품 의 서
        <span class="sub">주식회사 삼성이엔지 · ${_esc(payload.docDate)} 작성</span>
      </h1>

      <div class="approval">
        <div class="label-cell">결<br/>재</div>
        <div class="role-box"><div class="role">담당</div><div class="sign"></div></div>
        <div class="role-box"><div class="role">팀장</div><div class="sign"></div></div>
        <div class="role-box"><div class="role">대표</div><div class="sign"></div></div>
      </div>

      <div class="sec-title">1. 계약 개요</div>
      <table class="info">
        <tr><td class="k">프로젝트명</td><td class="v strong">${_esc(contract.projectName)}</td></tr>
        <tr><td class="k">거래처</td><td class="v">${_esc(contract.client)} · 계약일 ${_esc(contract.contractDate || '')}</td></tr>
        <tr><td class="k">총 계약금</td><td class="v strong">${_num(contract.totalAmount)}원 (부가세 별도)</td></tr>
      </table>

      <div class="sec-title">2. 지급 대상 (도급업체)</div>
      <table class="info">
        <tr><td class="k">업체명</td><td class="v">${_esc(payload.subcontractor || contract.subcontractor || '-')}${payload.subBizNo ? ` (${_esc(payload.subBizNo)})` : ''}</td></tr>
        <tr><td class="k">담당자</td><td class="v">${_esc(payload.subManager || '-')}${payload.subManagerTel ? ' · ' + _esc(payload.subManagerTel) : ''}</td></tr>
        <tr><td class="k">입금 계좌</td><td class="v">${_esc(payload.subBank || '')} ${_esc(payload.subAccount || '')} ${payload.subHolder ? '(' + _esc(payload.subHolder) + ')' : ''}</td></tr>
      </table>

      <div class="sec-title">3. 기성 진행 현황</div>
      ${buildRoundsTable(contract, payload)}

      <div class="grand-total">
        <div class="lbl">4. 금회 지급 총액</div>
        <div class="val">₩ ${_num(payload.grandTotal)}</div>
        <div class="breakdown">
          설치비 ${_num(payload.amount)}${payload.expenseItems?.length ? ' · 기타 ' + _num(sumBy(payload.expenseItems, 'amount')) : ''}${payload.commissionItems?.length ? ' · 수수료 ' + _num(sumBy(payload.commissionItems, 'amount')) : ''}
        </div>
      </div>

      <div class="sec-title">5. 비고</div>
      <div class="note-box">${_esc(payload.note || '-')}</div>
    `;
  }

  function buildRoundsTable(contract, payload) {
    const totalC = contract.subcontractAmount || 0;
    const prev = payload.prevProgress || 0;
    // 간단히: 전회 누계 · 금회 · 잔액 3행
    const curAmt = payload.amount || 0;
    const cumAfter = prev + curAmt;
    const bal = Math.max(totalC - cumAfter, 0);
    return `
      <table class="items" style="margin-bottom:8pt;">
        <tr>
          <th class="ctr">구분</th>
          <th class="num">금액</th>
          <th class="num">누적%</th>
        </tr>
        <tr>
          <td class="ctr">도급금액 (계약)</td>
          <td class="num">${_num(totalC)}</td>
          <td class="num">100.0%</td>
        </tr>
        <tr>
          <td class="ctr">전회까지 누계</td>
          <td class="num">${_num(prev)}</td>
          <td class="num">${totalC > 0 ? (prev / totalC * 100).toFixed(1) : '0.0'}%</td>
        </tr>
        <tr style="background:#fff9d6; font-weight:700;">
          <td class="ctr">${_esc(payload.roundNo)}차 · 금회 요청</td>
          <td class="num">${_num(curAmt)}</td>
          <td class="num">${totalC > 0 ? (cumAfter / totalC * 100).toFixed(1) : '0.0'}%</td>
        </tr>
        <tr class="total">
          <td class="ctr">잔액</td>
          <td class="num">${_num(bal)}</td>
          <td class="num">${totalC > 0 ? (bal / totalC * 100).toFixed(1) : '0.0'}%</td>
        </tr>
      </table>
    `;
  }

  function sumBy(arr, key) {
    return (arr || []).reduce((s, r) => s + (Number(r[key]) || 0), 0);
  }

  function buildPage2Install({ contract, payload }) {
    const items = (payload.installItems || []).filter(r => r.name);
    const total = items.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0), 0);
    return `
      <h2 class="page-title">
        설치비 내역서
        <span class="sub">계약 ${_esc(contractCode(contract))} · ${_esc(contract.projectName)}</span>
      </h2>
      <table class="items">
        <thead>
          <tr>
            <th class="ctr" style="width:8%;">번호</th>
            <th style="width:32%;">품명</th>
            <th style="width:14%;">규격</th>
            <th class="num" style="width:8%;">수량</th>
            <th class="ctr" style="width:8%;">단위</th>
            <th class="num" style="width:15%;">단가</th>
            <th class="num" style="width:15%;">금액</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((r, i) => `
            <tr>
              <td class="ctr">${i + 1}</td>
              <td>${_esc(r.name)}</td>
              <td class="ctr">${_esc(r.spec)}</td>
              <td class="num">${_num(r.qty)}</td>
              <td class="ctr">${_esc(r.unit)}</td>
              <td class="num">${_num(r.unitPrice)}</td>
              <td class="num">${_num((Number(r.qty)||0) * (Number(r.unitPrice)||0))}</td>
            </tr>
          `).join('')}
          <tr class="total">
            <td colspan="6" class="ctr">합 계</td>
            <td class="num">${_num(total)}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function buildPage3Product({ contract, payload }) {
    const items = (payload.productItems || []).filter(r => r.name);
    const summary = payload.productSummary;
    const total = items.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0), 0);
    return `
      <h2 class="page-title">
        제품 내역서 (장비대)
        <span class="sub">계약 ${_esc(contractCode(contract))} · ${_esc(contract.projectName)}</span>
      </h2>

      ${summary ? `
        <div class="product-summary">
          <div><div class="lbl">출고가 (정가)</div><div class="val">${_num(summary.totalList)}원</div></div>
          <div><div class="lbl">실효 DC율</div><div class="val">${((summary.effectiveDc||0)*100).toFixed(1)}%</div></div>
          <div class="hi"><div class="lbl">재료비 합계</div><div class="val">${_num(summary.totalMaterial)}원</div></div>
        </div>
      ` : ''}

      <table class="items">
        <thead>
          <tr>
            <th style="width:26%;">품명</th>
            <th style="width:14%;">모델</th>
            <th class="ctr" style="width:6%;">단위</th>
            <th class="num" style="width:6%;">수량</th>
            <th class="num" style="width:14%;">출고가</th>
            <th class="num" style="width:6%;">DC</th>
            <th class="num" style="width:14%;">재료비 단가</th>
            <th class="num" style="width:14%;">재료비</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td>${_esc(r.name)}</td>
              <td>${_esc(r.model)}</td>
              <td class="ctr">${_esc(r.unit)}</td>
              <td class="num">${_num(r.qty)}</td>
              <td class="num">${_num(r.listPrice)}</td>
              <td class="num">${r.dcRate ? (r.dcRate * 100).toFixed(0) + '%' : '-'}</td>
              <td class="num">${_num(r.unitPrice)}</td>
              <td class="num">${_num((Number(r.qty)||0) * (Number(r.unitPrice)||0))}</td>
            </tr>
          `).join('')}
          <tr class="total">
            <td colspan="7" class="ctr">재료비 합계 (장비대 A1)</td>
            <td class="num">${_num(summary?.totalMaterial || total)}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function buildPage4Etc({ contract, payload }) {
    const etc = (payload.expenseItems || []).filter(r => r.name);
    const comm = (payload.commissionItems || []).filter(r => r.name);
    const etcTotal = etc.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const commTotal = comm.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const receiptIcon = (r) => {
      if (!r.receipt) return '-';
      const isImg = (r.receipt.type || '').startsWith('image/');
      return isImg ? '🧾' : '📄';
    };

    return `
      <h2 class="page-title">
        기타 경비 · 영업 수수료
        <span class="sub">계약 ${_esc(contractCode(contract))} · ${_esc(contract.projectName)}</span>
      </h2>

      ${etc.length > 0 ? `
        <div class="sec-title">◈ 기타 경비</div>
        <table class="items" style="margin-bottom:12pt;">
          <thead>
            <tr>
              <th style="width:32%;">품명</th>
              <th class="ctr" style="width:8%;">단위</th>
              <th class="num" style="width:7%;">수량</th>
              <th class="num" style="width:14%;">금액</th>
              <th style="width:29%;">비고</th>
              <th class="ctr" style="width:10%;">증빙</th>
            </tr>
          </thead>
          <tbody>
            ${etc.map(r => `
              <tr>
                <td>${_esc(r.name)}</td>
                <td class="ctr">${_esc(r.unit)}</td>
                <td class="num">${_num(r.qty)}</td>
                <td class="num">${_num(r.amount)}</td>
                <td>${_esc(r.note)}</td>
                <td class="ctr">${receiptIcon(r)}</td>
              </tr>
            `).join('')}
            <tr class="total">
              <td colspan="3" class="ctr">기타 경비 합계</td>
              <td class="num">${_num(etcTotal)}</td>
              <td colspan="2" class="ctr">증빙 ${etc.filter(r => r.receipt).length}/${etc.length}</td>
            </tr>
          </tbody>
        </table>
      ` : ''}

      ${comm.length > 0 ? `
        <div class="sec-title">◈ 영업 수수료</div>
        <table class="items" style="margin-bottom:12pt;">
          <thead>
            <tr>
              <th style="width:32%;">품명</th>
              <th class="ctr" style="width:8%;">단위</th>
              <th class="num" style="width:7%;">수량</th>
              <th class="num" style="width:14%;">금액</th>
              <th style="width:29%;">비고</th>
              <th class="ctr" style="width:10%;">증빙</th>
            </tr>
          </thead>
          <tbody>
            ${comm.map(r => `
              <tr>
                <td>${_esc(r.name)}</td>
                <td class="ctr">${_esc(r.unit)}</td>
                <td class="num">${_num(r.qty)}</td>
                <td class="num">${_num(r.amount)}</td>
                <td>${_esc(r.note)}</td>
                <td class="ctr">${receiptIcon(r)}</td>
              </tr>
            `).join('')}
            <tr class="total">
              <td colspan="3" class="ctr">영업 수수료 합계</td>
              <td class="num">${_num(commTotal)}</td>
              <td colspan="2" class="ctr">증빙 ${comm.filter(r => r.receipt).length}/${comm.length}</td>
            </tr>
          </tbody>
        </table>
      ` : ''}

      <div class="grand-total" style="text-align:right; padding:6pt 10pt;">
        <span style="color:#666; font-size:9pt;">전체 지급 총액</span>
        <b style="font-size:13pt; margin-left:10pt;">₩ ${_num(payload.grandTotal)}</b>
      </div>
    `;
  }

  function buildExpensePrintHtml({ contract, payload, form }) {
    const hasProduct = (payload.productItems || []).filter(r => r.name).length > 0 || payload.productSummary;
    const hasEtc = (payload.expenseItems || []).some(r => r.name) || (payload.commissionItems || []).some(r => r.name);

    const pages = [];
    pages.push(buildPage1({ contract, payload }));
    pages.push(buildPage2Install({ contract, payload }));
    if (hasProduct) pages.push(buildPage3Product({ contract, payload }));
    if (hasEtc) pages.push(buildPage4Etc({ contract, payload }));

    const totalPages = pages.length;
    const html = pages.map((inner, i) => pageWrap(i + 1, totalPages, inner)).join('\n');

    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>지출품의서 · ${_esc(contract.projectName)} · ${_esc(payload.roundNo)}차</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>${CSS_PRINT}</style>
</head>
<body>
${html}
</body>
</html>`;
  }

  window.buildExpensePrintHtml = buildExpensePrintHtml;
})();
