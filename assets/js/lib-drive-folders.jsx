/* ═══════════════════════════════════════════════════════════════
   Drive 폴더 자동 연동 라이브러리
   - 최상위: '현장관리 자료' 폴더 (하드코딩 ID)
   - 프로젝트 폴더: 'YYYY년 M월 <프로젝트명>' 느슨 매칭
   - 하위 카테고리 5개: 제품대 / 설치비및부대비용 / 사업자등록증 / 도면 / 계약서
   - 1단계 (현재): 목업 데이터로 UI 확인
   - 2단계: gapi Drive API v3 실연동
═══════════════════════════════════════════════════════════════ */

// ─── 상수 ───
const DRIVE_ROOT_FOLDER_ID = '1PYMHWwsNYjygoDP1KKKjpk2lMAXIvXk0';
const DRIVE_ROOT_FOLDER_URL = `https://drive.google.com/drive/folders/${DRIVE_ROOT_FOLDER_ID}`;

const SITE_CATEGORIES = [
  { key: 'product',   name: '제품대',            icon: '📦' },
  { key: 'install',   name: '설치비및부대비용',   icon: '🔧' },
  { key: 'bizreg',    name: '사업자등록증',       icon: '📄' },
  { key: 'drawing',   name: '도면',              icon: '📐' },
  { key: 'contract',  name: '계약서',            icon: '📑' },
  // 🆕 지출품의서 관련 (v2)
  { key: 'expense',   name: '지출품의서',        icon: '🧾' },
  { key: 'receipts',  name: '증빙',              icon: '📎' },
];

// ─── 프로젝트 폴더명 생성 (계약일 + 프로젝트명) ───
// 계약일 예: '2026-08-15' → '2026년 8월'
// 최종: '2026년 8월 [탄소바우처]대진이엔지 냉난방기 공사'
function buildProjectFolderName(contract) {
  if (!contract) return '';
  const projectName = String(contract.projectName || '').trim();
  const dateStr = String(contract.contractDate || '').trim();
  const m = dateStr.match(/^(\d{4})[-\/](\d{1,2})/);
  if (!m) return projectName;
  const y = m[1];
  const mo = parseInt(m[2], 10);
  return `${y}년 ${mo}월 ${projectName}`;
}

// ─── 폴더명 느슨 매칭 정규식 ───
// '2026년 8월  [탄소바우처]대진이엔지 냉난방기 공사   ' 등 공백 다중 허용
function makeFolderNameMatcher(contract) {
  const projectName = String(contract?.projectName || '').trim();
  const dateStr = String(contract?.contractDate || '').trim();
  const m = dateStr.match(/^(\d{4})[-\/](\d{1,2})/);
  if (!m || !projectName) return null;
  const y = m[1];
  const mo = parseInt(m[2], 10);
  const escaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 공백 다중 허용, 앞뒤 공백 허용
  return new RegExp(`^\\s*${y}년\\s+${mo}월\\s+${escaped}\\s*$`);
}

// ─── 목업 데이터 (계약 번호별로 다른 상태 반환) ───
// 반환 형식:
// {
//   projectFolder: { id, name, url } | null,   // 프로젝트 폴더
//   categories: {                              // 카테고리별 최신 파일 상태
//     [key]: {
//       folder: { id, name, url } | null,
//       latestFile: { id, name, url, previewUrl, downloadUrl, iconLink,
//                     mimeType, size, modifiedTime } | null,
//       fileCount: number,
//     }
//   },
//   loading: false, error: null,
// }
function getMockSiteFolders(contract) {
  const contractNo = Number(contract?.no) || 0;
  const projectFolderName = buildProjectFolderName(contract);

  // 계약 번호 mod 4 로 4가지 상태 시나리오
  const scenario = contractNo % 4;

  // 시나리오 0: 프로젝트 폴더 자체가 없음
  if (scenario === 0) {
    return {
      projectFolder: null,
      categories: SITE_CATEGORIES.reduce((acc, c) => {
        acc[c.key] = { folder: null, latestFile: null, fileCount: 0 };
        return acc;
      }, {}),
      loading: false, error: null,
    };
  }

  // 프로젝트 폴더 존재
  const projectFolderId = `mock-proj-${contractNo}`;
  const projectFolder = {
    id: projectFolderId,
    name: projectFolderName,
    url: `https://drive.google.com/drive/folders/${projectFolderId}`,
  };

  // 시나리오 1: 프로젝트 폴더만 있고 하위는 모두 없음
  if (scenario === 1) {
    return {
      projectFolder,
      categories: SITE_CATEGORIES.reduce((acc, c) => {
        acc[c.key] = { folder: null, latestFile: null, fileCount: 0 };
        return acc;
      }, {}),
      loading: false, error: null,
    };
  }

  // 시나리오 2·3: 카테고리 일부/전부 있음
  const now = Date.now();
  const daysAgo = (d) => new Date(now - d * 86400000).toISOString();

  const mockFiles = {
    product: {
      folder: { id: 'mock-cat-product-'+contractNo, name: '제품대', url: `https://drive.google.com/drive/folders/mock-cat-product-${contractNo}` },
      latestFile: {
        id: 'file-product-'+contractNo,
        name: '견적서_v2.xlsx',
        url: `https://drive.google.com/file/d/file-product-${contractNo}/view`,
        previewUrl: `https://drive.google.com/file/d/file-product-${contractNo}/preview`,
        downloadUrl: `https://drive.google.com/uc?id=file-product-${contractNo}&export=download`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 245 * 1024,
        modifiedTime: daysAgo(2),
      },
      fileCount: 3,
    },
    install: {
      folder: { id: 'mock-cat-install-'+contractNo, name: '설치비및부대비용', url: `https://drive.google.com/drive/folders/mock-cat-install-${contractNo}` },
      latestFile: {
        id: 'file-install-'+contractNo,
        name: '설치견적서.xlsx',
        url: `https://drive.google.com/file/d/file-install-${contractNo}/view`,
        previewUrl: `https://drive.google.com/file/d/file-install-${contractNo}/preview`,
        downloadUrl: `https://drive.google.com/uc?id=file-install-${contractNo}&export=download`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 189 * 1024,
        modifiedTime: daysAgo(6),
      },
      fileCount: 2,
    },
    bizreg: {
      folder: { id: 'mock-cat-bizreg-'+contractNo, name: '사업자등록증', url: `https://drive.google.com/drive/folders/mock-cat-bizreg-${contractNo}` },
      latestFile: {
        id: 'file-bizreg-'+contractNo,
        name: '대진이엔지_사업자등록증.pdf',
        url: `https://drive.google.com/file/d/file-bizreg-${contractNo}/view`,
        previewUrl: `https://drive.google.com/file/d/file-bizreg-${contractNo}/preview`,
        downloadUrl: `https://drive.google.com/uc?id=file-bizreg-${contractNo}&export=download`,
        mimeType: 'application/pdf',
        size: 512 * 1024,
        modifiedTime: daysAgo(26),
      },
      fileCount: 1,
    },
    drawing: {
      folder: { id: 'mock-cat-drawing-'+contractNo, name: '도면', url: `https://drive.google.com/drive/folders/mock-cat-drawing-${contractNo}` },
      latestFile: {
        id: 'file-drawing-'+contractNo,
        name: '1층_평면도.pdf',
        url: `https://drive.google.com/file/d/file-drawing-${contractNo}/view`,
        previewUrl: `https://drive.google.com/file/d/file-drawing-${contractNo}/preview`,
        downloadUrl: `https://drive.google.com/uc?id=file-drawing-${contractNo}&export=download`,
        mimeType: 'application/pdf',
        size: 1.2 * 1024 * 1024,
        modifiedTime: daysAgo(26),
      },
      fileCount: 4,
    },
    contract: {
      folder: { id: 'mock-cat-contract-'+contractNo, name: '계약서', url: `https://drive.google.com/drive/folders/mock-cat-contract-${contractNo}` },
      latestFile: {
        id: 'file-contract-'+contractNo,
        name: '한별상회_계약서.pdf',
        url: `https://drive.google.com/file/d/file-contract-${contractNo}/view`,
        previewUrl: `https://drive.google.com/file/d/file-contract-${contractNo}/preview`,
        downloadUrl: `https://drive.google.com/uc?id=file-contract-${contractNo}&export=download`,
        mimeType: 'application/pdf',
        size: 892 * 1024,
        modifiedTime: daysAgo(26),
      },
      fileCount: 1,
    },
    // 🆕 지출품의서 · 증빙 (v2)
    expense: {
      folder: { id: 'mock-cat-expense-'+contractNo, name: '지출품의서', url: `https://drive.google.com/drive/folders/mock-cat-expense-${contractNo}` },
      latestFile: {
        id: 'file-expense-'+contractNo,
        name: '3차_2026-09-21_지출품의서.pdf',
        url: `https://drive.google.com/file/d/file-expense-${contractNo}/view`,
        previewUrl: `https://drive.google.com/file/d/file-expense-${contractNo}/preview`,
        downloadUrl: `https://drive.google.com/uc?id=file-expense-${contractNo}&export=download`,
        mimeType: 'application/pdf',
        size: 640 * 1024,
        modifiedTime: daysAgo(1),
      },
      fileCount: 3,
    },
    receipts: {
      folder: { id: 'mock-cat-receipts-'+contractNo, name: '증빙', url: `https://drive.google.com/drive/folders/mock-cat-receipts-${contractNo}` },
      latestFile: {
        id: 'folder-receipts-round3-'+contractNo,
        name: '3차_2026-09-21/ (폴더 · 3파일)',
        url: `https://drive.google.com/drive/folders/folder-receipts-round3-${contractNo}`,
        previewUrl: null,
        downloadUrl: null,
        mimeType: 'application/vnd.google-apps.folder',
        size: 0,
        modifiedTime: daysAgo(1),
      },
      fileCount: 3,
    },
  };

  // 시나리오 2: 일부 카테고리만 (도면·계약서·지출품의서·증빙 없음)
  if (scenario === 2) {
    return {
      projectFolder,
      categories: {
        product:  mockFiles.product,
        install:  mockFiles.install,
        bizreg:   mockFiles.bizreg,
        drawing:  { folder: null, latestFile: null, fileCount: 0 },
        contract: { folder: null, latestFile: null, fileCount: 0 },
        expense:  { folder: null, latestFile: null, fileCount: 0 },
        receipts: { folder: null, latestFile: null, fileCount: 0 },
      },
      loading: false, error: null,
    };
  }

  // 시나리오 3: 전부 있음
  return {
    projectFolder,
    categories: mockFiles,
    loading: false, error: null,
  };
}

// ─── 파일 크기 포맷 ───
function fmtFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + 'MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + 'GB';
}

// ─── 상대 시간 포맷 (예: '2일 전', '9월 15일') ───
function fmtRelativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 0) return d.toLocaleDateString('ko-KR');
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return days + '일 전';
  // 그 외에는 '9월 15일' 형식
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ─── 파일 타입 아이콘 ───
function fileTypeIcon(mimeType) {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
  if (mimeType.startsWith('video/')) return '🎥';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
  if (mimeType === 'application/vnd.google-apps.folder') return '📁';
  return '📎';
}

// ─── 미리보기 가능한 타입인가 ───
function isPreviewableMimeType(mimeType) {
  if (!mimeType) return false;
  return mimeType.startsWith('image/')
      || mimeType === 'application/pdf'
      || mimeType.startsWith('video/')
      || /google-apps\.(document|spreadsheet|presentation)/.test(mimeType);
}

// ═══════════════════════════════════════════════════════════════
// Drive API 실연동 (2단계)
// ═══════════════════════════════════════════════════════════════

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ─── 캐시 (localStorage · contract.no 별) ───
// 60초 안이면 Drive 를 다시 부르지 않고, 그보다 오래됐어도 7일 안이면 화면에 먼저 보여 주고
// 뒤에서 새로 조회한다 (peekFoldersCache). 탭을 닫았다 열어도 바로 보이도록 localStorage 사용.
const FOLDERS_CACHE_TTL_MS = 60 * 1000;
const FOLDERS_CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
function _readFoldersCache(contractNo) {
  try {
    const raw = localStorage.getItem('hb.siteFolders.' + contractNo);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function getFoldersCache(contractNo) {
  const parsed = _readFoldersCache(contractNo);
  if (!parsed?.ts || Date.now() - parsed.ts > FOLDERS_CACHE_TTL_MS) return null;
  return parsed.data;
}
// 오래된 캐시라도 돌려줌 (화면에 먼저 표시용) — 없거나 7일 지났으면 null
function peekFoldersCache(contractNo) {
  const parsed = _readFoldersCache(contractNo);
  if (!parsed?.ts || Date.now() - parsed.ts > FOLDERS_CACHE_STALE_MS) return null;
  return parsed.data;
}
function setFoldersCache(contractNo, data) {
  try {
    localStorage.setItem('hb.siteFolders.' + contractNo, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}
// 파일 업로드 등으로 내용이 바뀌었을 때: 다음 조회는 Drive 에서 새로 (화면용 옛 값은 남겨 둠)
function invalidateFoldersCache(contractNo) {
  try {
    const parsed = _readFoldersCache(contractNo);
    if (parsed) localStorage.setItem('hb.siteFolders.' + contractNo, JSON.stringify({ ts: 1, data: parsed.data }));
  } catch {}
}

// ─── 폴더 ID 기억 (localStorage · contract.no 별) ───
// 예전: 파일 하나 올릴 때마다 '현장관리 자료' 아래 폴더 수백 개를 전부 받아 이름으로 찾음
// 지금: 한 번 찾은 프로젝트·카테고리 폴더 ID 를 기억 → 다음부터는 바로 사용
//       (폴더명 기준이 바뀌거나 폴더가 지워졌으면 자동으로 다시 찾음)
const FOLDER_IDS_PREFIX = 'hb.driveFolderIds.';
function getFolderIds(contractNo) {
  try { return JSON.parse(localStorage.getItem(FOLDER_IDS_PREFIX + contractNo)) || null; } catch { return null; }
}
function setFolderIds(contractNo, ids) {
  try { localStorage.setItem(FOLDER_IDS_PREFIX + contractNo, JSON.stringify(ids)); } catch {}
}
function clearFolderIds(contractNo) {
  try { localStorage.removeItem(FOLDER_IDS_PREFIX + contractNo); } catch {}
}

// ─── gapi.client.drive 가 로드되어 있는지 확인 ───
function ensureDriveClient() {
  if (!window.gapi?.client) {
    throw new Error('gapi.client 가 로드되지 않았습니다. loadGoogleApis() 먼저 호출해야 합니다.');
  }
  if (!window.gapi.client.drive) {
    throw new Error('Google Drive API 클라이언트가 로드되지 않았습니다. Cloud Console에서 Drive API가 활성화되어 있는지, API Key가 올바른지 확인하세요.');
  }
}

// ─── Drive REST 래퍼 (gapi.client 사용) ───
// 폴더가 1000개를 넘어도 빠짐없이 (예전: 500개까지만 → 그 뒤 폴더는 못 찾고 새로 만드는 문제)
async function driveListFolders(parentId) {
  ensureDriveClient();
  const out = [];
  let pageToken;
  do {
    const res = await window.gapi.client.drive.files.list({
      q: `'${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
      fields: 'nextPageToken, files(id,name,webViewLink)',
      pageSize: 1000,
      orderBy: 'name',
      pageToken,
    });
    out.push(...(res.result.files || []));
    pageToken = res.result.nextPageToken;
  } while (pageToken);
  return out;
}

// '현장관리 자료' 폴더 목록 — 5분 동안 메모리에 보관 (여러 작업이 연달아 와도 한 번만 조회)
let _rootFoldersMemo = null;   // { ts, list }
async function listRootFolders(force) {
  if (!force && _rootFoldersMemo && Date.now() - _rootFoldersMemo.ts < 5 * 60 * 1000) return _rootFoldersMemo.list;
  const list = await driveListFolders(DRIVE_ROOT_FOLDER_ID);
  _rootFoldersMemo = { ts: Date.now(), list };
  return list;
}

// 기억해 둔 폴더가 아직 쓸 수 있는지 (지워지거나 휴지통이면 false)
async function driveFolderAlive(id) {
  try {
    const res = await window.gapi.client.drive.files.get({ fileId: id, fields: 'id,trashed' });
    return !!res.result && !res.result.trashed;
  } catch (e) { return false; }
}

// 계약 → 프로젝트 폴더 (기억해 둔 ID 우선) · create=true 면 없을 때 만듦
// 반환: Drive 폴더 원본 { id, name, webViewLink } 또는 null
async function resolveProjectFolder(contract, { create = false, verify = true } = {}) {
  const no = contract.no;
  const expected = buildProjectFolderName(contract);
  const ids = getFolderIds(no);
  if (ids?.project?.id && ids.name === expected) {
    if (!verify || await driveFolderAlive(ids.project.id)) return ids.project;
    clearFolderIds(no);
    _rootFoldersMemo = null;
  }
  const matcher = makeFolderNameMatcher(contract);
  const roots = await listRootFolders();
  let raw = matcher ? roots.find(f => matcher.test(f.name)) : null;
  if (!raw && create) {
    // 다른 사람이 방금 만들었을 수 있으니 목록을 새로 받아 한 번 더 확인
    const fresh = await listRootFolders(true);
    raw = matcher ? fresh.find(f => matcher.test(f.name)) : null;
    if (!raw) {
      raw = await driveCreateFolder(expected, DRIVE_ROOT_FOLDER_ID);
      if (_rootFoldersMemo) _rootFoldersMemo.list.push(raw);
    }
  }
  if (raw) setFolderIds(no, { name: expected, project: raw, cats: {} });
  return raw || null;
}

// 계약 → 카테고리 폴더까지 한 번에 → { project, category } (Drive 원본 · category 는 없으면 null)
// 카테고리 폴더 ID 를 기억하고 있으면 그 폴더만 확인 (휴지통에 간 프로젝트 폴더 안의 폴더도 휴지통 상태라
// 카테고리만 확인해도 충분) → 다음부터는 Drive 호출 1번
async function resolveCategoryPath(contract, catName, { create = false } = {}) {
  const ids = getFolderIds(contract.no);
  const catKnown = !!(ids?.name === buildProjectFolderName(contract) && ids.cats?.[catName]?.id);
  const project = await resolveProjectFolder(contract, { create, verify: !catKnown });
  if (!project) return { project: null, category: null };
  const category = await resolveCategoryFolder(contract, project, catName, { create });
  return { project, category };
}

// 프로젝트 폴더 안의 카테고리 폴더 (기억해 둔 ID 우선) · create=true 면 없을 때 만듦
async function resolveCategoryFolder(contract, projectRaw, catName, { create = false } = {}) {
  const no = contract.no;
  const ids = getFolderIds(no) || { name: buildProjectFolderName(contract), project: projectRaw, cats: {} };
  const known = ids.project?.id === projectRaw.id ? (ids.cats || {})[catName] : null;
  if (known?.id && await driveFolderAlive(known.id)) return known;
  const subs = await driveListFolders(projectRaw.id);
  const cats = {};
  subs.forEach(f => { cats[f.name.trim()] = f; });
  let raw = cats[catName] || null;
  if (!raw && create) { raw = await driveCreateFolder(catName, projectRaw.id); cats[catName] = raw; }
  setFolderIds(no, { ...ids, project: projectRaw, cats });
  return raw;
}

async function driveListLatestFile(folderId) {
  const res = await window.gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType != '${FOLDER_MIME}'`,
    fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,iconLink)',
    orderBy: 'modifiedTime desc',
    pageSize: 1,
  });
  return (res.result.files || [])[0] || null;
}

async function driveCountFiles(folderId) {
  const res = await window.gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType != '${FOLDER_MIME}'`,
    fields: 'files(id)',
    pageSize: 100,
  });
  return (res.result.files || []).length;
}

async function driveCreateFolder(name, parentId) {
  const res = await window.gapi.client.drive.files.create({
    resource: {
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
    fields: 'id, name, webViewLink',
  });
  return res.result;
}

// ─── Drive 파일 객체 → 카드에서 쓰는 형태로 변환 ───
function normalizeDriveFile(f) {
  if (!f) return null;
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? Number(f.size) : 0,
    modifiedTime: f.modifiedTime,
    url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
    previewUrl: `https://drive.google.com/file/d/${f.id}/preview`,
    downloadUrl: `https://drive.google.com/uc?id=${f.id}&export=download`,
    thumbnailLink: f.thumbnailLink,
    iconLink: f.iconLink,
  };
}

function normalizeDriveFolder(f) {
  if (!f) return null;
  return {
    id: f.id,
    name: f.name,
    url: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
  };
}

// ─── 메인: 계약 → 폴더·최신파일 상태 조회 ───
// options = { useCache: true, force: false }
async function fetchSiteFoldersFromDrive(contract, options) {
  const opts = options || {};
  const contractNo = contract?.no;
  if (!contractNo) throw new Error('계약 번호가 없습니다.');
  if (!hasDriveCredentials()) {
    throw new Error('Google Drive 인증 정보가 설정되지 않았습니다. 설정 화면에서 API Key와 Client ID를 등록하세요.');
  }

  // 캐시 확인
  if (opts.useCache !== false && !opts.force) {
    const cached = getFoldersCache(contractNo);
    if (cached) return { ...cached, _cached: true };
  }

  // 화면을 열 때 자동 조회: 토큰이 없으면 Google 로그인 창을 띄우지 않고 "연결" 버튼을 보여줌
  if (opts.interactive === false && !hasDriveToken()) {
    const err = new Error('Google Drive 연결 필요');
    err.needConnect = true;
    throw err;
  }

  await loadGoogleApis();
  await requestAccessToken();
  if (opts.force) _rootFoldersMemo = null;   // [새로고침] 은 루트 목록도 새로

  // 1) 프로젝트 폴더 — 기억해 둔 ID 가 있으면 루트 목록(수백 개)을 받지 않음
  const projectFolderNameExpected = buildProjectFolderName(contract);
  const emptyCats = () => SITE_CATEGORIES.reduce((acc, c) => {
    acc[c.key] = { folder: null, latestFile: null, fileCount: 0 };
    return acc;
  }, {});
  const cachedIds = getFolderIds(contractNo);
  const usedCachedId = !!(cachedIds?.project?.id && cachedIds.name === projectFolderNameExpected);
  let projectRaw = await resolveProjectFolder(contract, { verify: false });

  // 프로젝트 폴더가 없으면 → 카테고리 모두 없음
  if (!projectRaw) {
    const data = { projectFolder: null, projectFolderNameExpected, categories: emptyCats(), error: null };
    setFoldersCache(contractNo, data);
    return data;
  }

  // 2) 카테고리 폴더 목록 (+ 기억해 둔 ID 였다면 그 폴더가 살아 있는지 동시에 확인)
  let [subFolders, alive] = await Promise.all([
    driveListFolders(projectRaw.id),
    usedCachedId ? driveFolderAlive(projectRaw.id) : Promise.resolve(true),
  ]);
  if (!alive) {
    // 폴더가 지워졌거나 옮겨짐 → 기억 지우고 루트에서 다시 찾기
    clearFolderIds(contractNo);
    _rootFoldersMemo = null;
    projectRaw = await resolveProjectFolder(contract, { verify: false });
    if (!projectRaw) {
      const data = { projectFolder: null, projectFolderNameExpected, categories: emptyCats(), error: null };
      setFoldersCache(contractNo, data);
      return data;
    }
    subFolders = await driveListFolders(projectRaw.id);
  }
  const projectFolder = normalizeDriveFolder(projectRaw);
  const catByName = {};
  subFolders.forEach(f => { catByName[f.name.trim()] = f; });
  setFolderIds(contractNo, { name: projectFolderNameExpected, project: projectRaw, cats: catByName });

  // 3) 모든 카테고리의 파일을 한 번에 조회 (예전: 카테고리마다 2번씩 최대 14번)
  //    최근 수정 순으로 받아서 폴더별 첫 파일 = 최신 파일, 개수는 폴더별로 셈
  const catFolders = SITE_CATEGORIES.map(cat => [cat, catByName[cat.name] || null]).filter(([, f]) => f);
  const latestBy = {}, countBy = {};
  if (catFolders.length) {
    const parentQ = catFolders.map(([, f]) => `'${f.id}' in parents`).join(' or ');
    let pageToken, pages = 0;
    do {
      const res = await window.gapi.client.drive.files.list({
        q: `(${parentQ}) and trashed=false and mimeType != '${FOLDER_MIME}'`,
        fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,iconLink,parents)',
        orderBy: 'modifiedTime desc',
        pageSize: 1000,
        pageToken,
      });
      (res.result.files || []).forEach(f => {
        (f.parents || []).forEach(pid => {
          countBy[pid] = (countBy[pid] || 0) + 1;
          if (!latestBy[pid]) latestBy[pid] = f;
        });
      });
      pageToken = res.result.nextPageToken;
      pages++;
    } while (pageToken && pages < 5);
  }

  const categories = emptyCats();
  catFolders.forEach(([cat, f]) => {
    categories[cat.key] = {
      folder: normalizeDriveFolder(f),
      latestFile: normalizeDriveFile(latestBy[f.id] || null),
      fileCount: countBy[f.id] || 0,
    };
  });
  const data = { projectFolder, projectFolderNameExpected, categories, error: null };
  setFoldersCache(contractNo, data);
  return data;
}

// ─── 폴더 생성: 프로젝트 폴더 + 하위 5개 카테고리 함께 ───
async function createProjectFolderTree(contract) {
  if (!hasDriveCredentials()) throw new Error('Drive 자격 증명 필요');
  await loadGoogleApis();
  await requestAccessToken();

  const name = buildProjectFolderName(contract);
  if (!name) throw new Error('프로젝트 폴더명을 생성할 수 없습니다 (계약일·프로젝트명 필요)');

  // 이미 존재하면 재사용
  const projectRaw = await resolveProjectFolder(contract, { create: true });

  // 하위 카테고리 생성 (이미 있는 것은 스킵) — 하나씩 차례로 → 동시에
  const existingSubs = await driveListFolders(projectRaw.id);
  const existingByName = {};
  existingSubs.forEach(f => { existingByName[f.name.trim()] = f; });
  const made = await Promise.all(SITE_CATEGORIES
    .filter(cat => !existingByName[cat.name])
    .map(cat => driveCreateFolder(cat.name, projectRaw.id)));
  made.forEach(f => { if (f?.name) existingByName[f.name.trim()] = f; });
  setFolderIds(contract.no, { name, project: projectRaw, cats: existingByName });

  invalidateFoldersCache(contract.no);
  return normalizeDriveFolder(projectRaw);
}

// ─── 단일 카테고리 폴더 생성 (프로젝트 폴더는 이미 존재해야 함) ───
async function createCategoryFolder(contract, category, projectFolderId) {
  if (!projectFolderId) throw new Error('프로젝트 폴더가 필요합니다');
  await loadGoogleApis();
  await requestAccessToken();

  // 중복 방지
  const projectRaw = { id: projectFolderId };
  const ids = getFolderIds(contract.no);
  const raw = await resolveCategoryFolder(contract, ids?.project?.id === projectFolderId ? ids.project : projectRaw, category.name, { create: true });
  invalidateFoldersCache(contract.no);
  return normalizeDriveFolder(raw);
}

// ─── 호환용 alias ───
async function createDriveFolder(name, parentId) {
  await loadGoogleApis();
  await requestAccessToken();
  return normalizeDriveFolder(await driveCreateFolder(name, parentId));
}

// ═══════════════════════════════════════════════════════════════
//  파일 업로드 · Drive Multipart Upload
// ═══════════════════════════════════════════════════════════════

// Blob/File → Drive multipart upload
// parentId 폴더에 새 파일로 업로드하고 fileId/webViewLink 반환
async function uploadFileToDrive(blob, filename, parentId, mimeTypeOverride) {
  await loadGoogleApis();
  const token = await requestAccessToken();
  if (!parentId) throw new Error('업로드할 폴더 ID 가 필요합니다.');
  if (!blob) throw new Error('업로드할 파일이 없습니다.');

  const mimeType = mimeTypeOverride || blob.type || 'application/octet-stream';
  const metadata = { name: filename, parents: [parentId], mimeType };
  const boundary = '-------hbdash-' + Date.now().toString(36) + Math.random().toString(36).slice(2);   // 파일 내용과 겹치지 않도록 매번 다르게
  const delimiter = '\r\n--' + boundary + '\r\n';
  const closeDelim = '\r\n--' + boundary + '--';

  // (속도) 파일을 base64 로 바꾸지 않고 그대로 보냄 — 변환 시간이 없고 전송량도 약 25% 적음
  const body = new Blob([
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' + mimeType + '\r\n\r\n',
    blob,
    closeDelim,
  ]);

  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType,size,modifiedTime';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'multipart/related; boundary=' + boundary,
    },
    body,
  });
  if (!res.ok) {
    let errText = await res.text();
    try {
      const errObj = JSON.parse(errText);
      errText = errObj.error?.message || errText;
    } catch {}
    throw new Error('업로드 실패 (HTTP ' + res.status + '): ' + errText);
  }
  return await res.json(); // { id, name, webViewLink, mimeType, size, modifiedTime }
}

// ─── 프로젝트 폴더 + 카테고리 폴더 찾기(없으면 생성) — 파일 업로드 없이 폴더만 필요할 때 ───
// (예: Drive Picker를 해당 카테고리 폴더로 바로 열기 위해 폴더 ID만 먼저 알아야 하는 경우)
async function findOrCreateCategoryFolder(contract, categoryKey) {
  await loadGoogleApis();
  await requestAccessToken();

  const category = SITE_CATEGORIES.find(c => c.key === categoryKey);
  if (!category) throw new Error('알 수 없는 카테고리: ' + categoryKey);

  // 프로젝트 폴더 · 카테고리 폴더 찾기 또는 생성 (기억해 둔 ID 우선)
  const { project: projectFolder, category: catFolder } = await resolveCategoryPath(contract, category.name, { create: true });

  return { project: normalizeDriveFolder(projectFolder), category: normalizeDriveFolder(catFolder) };
}

// 특정 카테고리 폴더에 파일 업로드 (프로젝트 폴더/카테고리 폴더가 없으면 자동 생성)
async function uploadFileToCategory(contract, categoryKey, blob, filename) {
  const { category: catFolder } = await findOrCreateCategoryFolder(contract, categoryKey);
  const uploaded = await uploadFileToDrive(blob, filename, catFolder.id);
  invalidateFoldersCache(contract.no);
  return { file: normalizeDriveFile(uploaded), folder: catFolder };
}

// 지출품의서 PDF 저장 (지출품의서 폴더에 회차별 파일명으로)
async function uploadExpensePdf(contract, roundNo, docDate, pdfBlob) {
  const filename = `${roundNo}차_${docDate}_지출품의서.pdf`;
  return uploadFileToCategory(contract, 'expense', pdfBlob, filename);
}

// 증빙 파일 일괄 업로드 (증빙/N차_YYYY-MM-DD/ 서브폴더 자동 생성)
// files: [{ blob, filename }]
async function uploadExpenseReceipts(contract, roundNo, docDate, files) {
  if (!files || files.length === 0) return [];
  await loadGoogleApis();
  await requestAccessToken();

  // 프로젝트 폴더 → 증빙/ → N차_docDate/ 3단계 확보 (앞의 두 단계는 기억해 둔 ID 우선)
  const { category: receiptsFolder } = await resolveCategoryPath(contract, '증빙', { create: true });

  // N차_YYYY-MM-DD/
  const roundFolderName = `${roundNo}차_${docDate}`;
  const roundFolders = await driveListFolders(receiptsFolder.id);
  let roundFolder = roundFolders.find(f => f.name.trim() === roundFolderName);
  if (!roundFolder) {
    roundFolder = await driveCreateFolder(roundFolderName, receiptsFolder.id);
  }

  // 파일들 병렬 업로드
  const results = await Promise.all(files.map(async (item) => {
    try {
      const uploaded = await uploadFileToDrive(item.blob, item.filename, roundFolder.id);
      return { ok: true, file: normalizeDriveFile(uploaded), original: item.filename };
    } catch (e) {
      return { ok: false, error: e.message || String(e), original: item.filename };
    }
  }));

  invalidateFoldersCache(contract.no);
  return {
    folder: normalizeDriveFolder(roundFolder),
    results,
    uploaded: results.filter(r => r.ok).map(r => r.file),
    failed: results.filter(r => !r.ok),
  };
}

// 지출품의서 이력 조회 (Drive 폴더에서 PDF 목록)
async function listExpenseHistoryFromDrive(contract) {
  await loadGoogleApis();
  await requestAccessToken();
  const { category: expenseFolder } = await resolveCategoryPath(contract, '지출품의서');
  if (!expenseFolder) return [];

  // 파일 목록 조회
  const res = await window.gapi.client.drive.files.list({
    q: `'${expenseFolder.id}' in parents and trashed=false and mimeType != '${FOLDER_MIME}'`,
    fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
    orderBy: 'name',
    pageSize: 200,
  });
  return (res.result.files || []).map(f => {
    const norm = normalizeDriveFile(f);
    // 파일명에서 회차·날짜 파싱: "3차_2026-09-21_지출품의서.pdf"
    const m = (f.name || '').match(/^(\d+)차_(\d{4}-\d{2}-\d{2})/);
    return {
      ...norm,
      roundNo: m ? Number(m[1]) : null,
      docDate: m ? m[2] : null,
    };
  });
}

// ─── 전역 노출 ───
Object.assign(window, {
  DRIVE_ROOT_FOLDER_ID,
  DRIVE_ROOT_FOLDER_URL,
  SITE_CATEGORIES,
  buildProjectFolderName,
  makeFolderNameMatcher,
  getMockSiteFolders,
  // 실연동 API
  fetchSiteFoldersFromDrive,
  createProjectFolderTree,
  createCategoryFolder,
  createDriveFolder,
  findOrCreateCategoryFolder,
  invalidateFoldersCache,
  peekFoldersCache,
  // 🆕 파일 업로드
  uploadFileToDrive,
  uploadFileToCategory,
  uploadExpensePdf,
  uploadExpenseReceipts,
  listExpenseHistoryFromDrive,
  // 유틸
  fmtFileSize,
  fmtRelativeTime,
  fileTypeIcon,
  isPreviewableMimeType,
});
