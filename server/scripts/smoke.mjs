const BASE = 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name} ${detail}`);
  }
}

async function req(method, path, { token, cookie, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, setCookies: res.headers.getSetCookie() };
}

function refreshCookie(setCookies) {
  const header = setCookies.find((c) => c.startsWith('tm_refresh='));
  return header ? header.split(';')[0] : null;
}

const stamp = Date.now();
const emailA = `alice.${stamp}@example.com`;
const emailB = `bob.${stamp}@example.com`;

// Health
const health = await req('GET', '/health');
check('health endpoint', health.status === 200 && health.data.status === 'ok');

// Register validation
const badReg = await req('POST', '/auth/register', {
  body: { name: 'X', email: 'not-an-email', password: 'short' },
});
check('register validation rejects bad input', badReg.status === 400);

// Register + login A
const regA = await req('POST', '/auth/register', {
  body: { name: 'Alice Tester', email: emailA, password: 'password123' },
});
check('register user A', regA.status === 201 && Boolean(regA.data.accessToken));
check(
  'refresh token not exposed in response body',
  regA.data.refreshToken === undefined && Boolean(regA.data.accessToken)
);
check(
  'register sets HttpOnly refresh cookie',
  regA.setCookies.some((c) => c.startsWith('tm_refresh=') && /httponly/i.test(c))
);
const tokenA = regA.data.accessToken;

const dup = await req('POST', '/auth/register', {
  body: { name: 'Alice Again', email: emailA, password: 'password123' },
});
check('duplicate email rejected', dup.status === 409);

const badLogin = await req('POST', '/auth/login', {
  body: { email: emailA, password: 'wrong-password' },
});
check('wrong password rejected', badLogin.status === 401);

const loginA = await req('POST', '/auth/login', {
  body: { email: emailA, password: 'password123' },
});
check('login user A', loginA.status === 200 && Boolean(loginA.data.accessToken));

const meA = await req('GET', '/auth/me', { token: tokenA });
check('GET /auth/me', meA.status === 200 && meA.data.user.email === emailA);

const noAuth = await req('GET', '/tasks');
check('tasks require auth', noAuth.status === 401);

// Refresh flow: rotation, replay rejection, revocation on logout
const noCookie = await req('POST', '/auth/refresh');
check('refresh without cookie rejected', noCookie.status === 401);

const loginCookie = refreshCookie(loginA.setCookies);
check('login sets refresh cookie', Boolean(loginCookie));

const refreshed = await req('POST', '/auth/refresh', { cookie: loginCookie });
check(
  'refresh issues new access token',
  refreshed.status === 200 && Boolean(refreshed.data.accessToken)
);
check('refresh returns the user', refreshed.data.user?.email === emailA);

const refreshedMe = await req('GET', '/auth/me', { token: refreshed.data.accessToken });
check('refreshed access token authorizes requests', refreshedMe.status === 200);

const rotatedCookie = refreshCookie(refreshed.setCookies);
check('refresh rotates the cookie', Boolean(rotatedCookie) && rotatedCookie !== loginCookie);

const replay = await req('POST', '/auth/refresh', { cookie: loginCookie });
check('rotated-out refresh token rejected', replay.status === 401);

const logoutA = await req('POST', '/auth/logout', { cookie: rotatedCookie });
check('logout succeeds', logoutA.status === 204);

const afterLogout = await req('POST', '/auth/refresh', { cookie: rotatedCookie });
check('refresh rejected after logout', afterLogout.status === 401);

// Register B
const regB = await req('POST', '/auth/register', {
  body: { name: 'Bob Tester', email: emailB, password: 'password123' },
});
const tokenB = regB.data.accessToken;
check('register user B', regB.status === 201);

// Categories
const catRes = await req('POST', '/categories', {
  token: tokenA,
  body: { name: 'Development', color: '#10b981' },
});
check('create category', catRes.status === 201 && catRes.data.category.name === 'Development');
const categoryId = catRes.data.category.id;

const badCat = await req('POST', '/categories', {
  token: tokenA,
  body: { name: 'Development' },
});
check('duplicate category rejected', badCat.status === 409);

const listCats = await req('GET', '/categories', { token: tokenA });
check('list categories', listCats.status === 200 && listCats.data.categories.length === 1);

// Tasks
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const t1 = await req('POST', '/tasks', {
  token: tokenA,
  body: {
    title: 'Fix overdue bug',
    description: 'Something is broken',
    priority: 'high',
    dueAt: yesterday,
    categoryId,
    estimatedDurationMinutes: 90,
  },
});
check('create task t1', t1.status === 201 && t1.data.task.isOverdue === true);
const t1Id = t1.data.task.id;

const t2 = await req('POST', '/tasks', {
  token: tokenA,
  body: { title: 'Write report', status: 'in_progress', priority: 'medium', dueAt: tomorrow },
});
check('create task t2 (in_progress)', t2.status === 201);
const t2Id = t2.data.task.id;

const t3 = await req('POST', '/tasks', {
  token: tokenA,
  body: { title: 'Ship release', status: 'completed', priority: 'low' },
});
check('create task t3 (completed)', t3.status === 201 && Boolean(t3.data.task.completedAt));

const badTask = await req('POST', '/tasks', {
  token: tokenA,
  body: { title: '', priority: 'nonsense' },
});
check('create task validation', badTask.status === 400);

const badCatTask = await req('POST', '/tasks', {
  token: tokenA,
  body: { title: 'Bad category', categoryId: '64b7f0f0f0f0f0f0f0f0f0f0' },
});
check('task with foreign category rejected', badCatTask.status === 400);

// Listing / filters
const all = await req('GET', '/tasks', { token: tokenA });
check('list all tasks', all.status === 200 && all.data.total === 3);

const overdue = await req('GET', '/tasks?overdue=true', { token: tokenA });
check('overdue filter', overdue.data.tasks.length === 1 && overdue.data.tasks[0].id === t1Id);

const inProg = await req('GET', '/tasks?status=in_progress', { token: tokenA });
check('status filter', inProg.data.tasks.length === 1 && inProg.data.tasks[0].id === t2Id);

const search = await req('GET', '/tasks?search=report', { token: tokenA });
check('search filter', search.data.tasks.length === 1 && search.data.tasks[0].id === t2Id);

const byCat = await req('GET', `/tasks?categoryId=${categoryId}`, { token: tokenA });
check('category filter', byCat.data.tasks.length === 1 && byCat.data.tasks[0].id === t1Id);

const sorted = await req('GET', '/tasks?sort=dueAt', { token: tokenA });
check('sort by due date asc', sorted.status === 200);

// Update
const patched = await req('PATCH', `/tasks/${t2Id}`, {
  token: tokenA,
  body: { status: 'completed' },
});
check(
  'complete task sets completedAt',
  patched.status === 200 && patched.data.task.status === 'completed' && Boolean(patched.data.task.completedAt)
);

const reopened = await req('PATCH', `/tasks/${t2Id}`, {
  token: tokenA,
  body: { status: 'todo' },
});
check('reopen clears completedAt', reopened.data.task.completedAt === null);

const noLongerOverdue = await req('PATCH', `/tasks/${t1Id}`, {
  token: tokenA,
  body: { status: 'cancelled', dueAt: null },
});
check(
  'cancelled + cleared due date removes overdue flag',
  noLongerOverdue.data.task.isOverdue === false
);

// Dashboard
const dash = await req('GET', '/dashboard/summary', { token: tokenA });
const s = dash.data?.summary;
check(
  'dashboard summary counts',
  dash.status === 200 &&
    s.total === 3 &&
    s.todo === 1 &&
    s.inProgress === 0 &&
    s.completed === 1 &&
    s.cancelled === 1 &&
    s.overdue === 0,
  JSON.stringify(s)
);
check('dashboard trend has 7 entries', Array.isArray(s.trend) && s.trend.length === 7);
const todayUtc = new Date().toISOString().slice(0, 10);
check(
  'dashboard trend includes today with completions',
  s.trend[6]?.date === todayUtc && s.trend[6]?.count === 1,
  JSON.stringify(s.trend)
);

// Archive / restore
const archived = await req('DELETE', `/tasks/${t1Id}`, { token: tokenA });
check('archive task', archived.status === 200 && archived.data.task.isArchived === true);

const activeList = await req('GET', '/tasks', { token: tokenA });
check('archived task hidden from active list', activeList.data.total === 2);

const archivedList = await req('GET', '/tasks?archived=true', { token: tokenA });
check('archived list shows archived task', archivedList.data.tasks.length === 1);

const restored = await req('POST', `/tasks/${t1Id}/restore`, { token: tokenA });
check('restore task', restored.status === 200 && restored.data.task.isArchived === false);

// Cross-user isolation
const bReadsA = await req('GET', `/tasks/${t1Id}`, { token: tokenB });
check('user B cannot read user A task', bReadsA.status === 404);

const bWritesA = await req('PATCH', `/tasks/${t1Id}`, { token: tokenB, body: { title: 'hacked' } });
check('user B cannot update user A task', bWritesA.status === 404);

const bDeletesA = await req('DELETE', `/tasks/${t1Id}`, { token: tokenB });
check('user B cannot archive user A task', bDeletesA.status === 404);

const bList = await req('GET', '/tasks', { token: tokenB });
check('user B list is empty', bList.data.total === 0);

const bCatDelete = await req('DELETE', `/categories/${categoryId}`, { token: tokenB });
check('user B cannot delete user A category', bCatDelete.status === 404);

// Category delete unlinks tasks
const delCat = await req('DELETE', `/categories/${categoryId}`, { token: tokenA });
check('category delete', delCat.status === 200);
const t1After = await req('GET', `/tasks/${t1Id}`, { token: tokenA });
check('category delete unlinks task', t1After.data.task.categoryId === null);

// Phase 2: assignment, subtasks, activity log, cascade archive
const emailC = `carol.${stamp}@example.com`;
const emailD = `dave.${stamp}@example.com`;

const regC = await req('POST', '/auth/register', {
  body: { name: 'Carol Tester', email: emailC, password: 'password123' },
});
const tokenC = regC.data.accessToken;
const userIdC = regC.data.user.id;
check('register user C (assignee)', regC.status === 201);

const regD = await req('POST', '/auth/register', {
  body: { name: 'Dave Tester', email: emailD, password: 'password123' },
});
const tokenD = regD.data.accessToken;
check('register user D (owner)', regD.status === 201);

const usersNoAuth = await req('GET', '/users');
check('user search requires auth', usersNoAuth.status === 401);

const usersSearch = await req('GET', `/users?search=${encodeURIComponent(emailD)}`, {
  token: tokenD,
});
check(
  'user search finds user by email',
  usersSearch.status === 200 &&
    usersSearch.data.users.some((u) => u.email === emailD && !('passwordHash' in u))
);

const dTaskRes = await req('POST', '/tasks', {
  token: tokenD,
  body: { title: 'Shared rollout plan', priority: 'medium', assigneeIds: [userIdC] },
});
check(
  'create task with assignees',
  dTaskRes.status === 201 && dTaskRes.data.task.assignees.some((a) => a.id === userIdC)
);
check('creator is owner', dTaskRes.data.task.isOwner === true);
const dTaskId = dTaskRes.data.task.id;

const badAssignee = await req('POST', '/tasks', {
  token: tokenD,
  body: { title: 'Bad assignee', assigneeIds: ['64b7f0f0f0f0f0f0f0f0f0f0'] },
});
check('unknown assignee rejected', badAssignee.status === 400);

const cList = await req('GET', '/tasks', { token: tokenC });
check(
  'assignee sees assigned task',
  cList.status === 200 && cList.data.tasks.some((t) => t.id === dTaskId)
);

const cStatus = await req('PATCH', `/tasks/${dTaskId}`, {
  token: tokenC,
  body: { status: 'in_progress' },
});
check(
  'assignee can update status',
  cStatus.status === 200 && cStatus.data.task.status === 'in_progress'
);

const cTitle = await req('PATCH', `/tasks/${dTaskId}`, {
  token: tokenC,
  body: { title: 'Not allowed' },
});
check('assignee cannot edit other fields', cTitle.status === 403);

const st1Res = await req('POST', `/tasks/${dTaskId}/subtasks`, {
  token: tokenD,
  body: { title: 'Draft the checklist' },
});
check(
  'create subtask',
  st1Res.status === 201 &&
    st1Res.data.task.parentTaskId === dTaskId &&
    st1Res.data.task.isOwner === true
);
const st1Id = st1Res.data.task.id;

const st2Res = await req('POST', `/tasks/${dTaskId}/subtasks`, {
  token: tokenD,
  body: { title: 'Book the venue', dueAt: tomorrow },
});
check('create second subtask', st2Res.status === 201);

const nested = await req('POST', `/tasks/${st1Id}/subtasks`, {
  token: tokenD,
  body: { title: 'Nested subtask' },
});
check('nested subtasks rejected', nested.status === 400);

const cSubtask = await req('POST', `/tasks/${dTaskId}/subtasks`, {
  token: tokenC,
  body: { title: 'Assignee subtask' },
});
check('assignee cannot create subtasks', cSubtask.status === 403);

const dList = await req('GET', '/tasks', { token: tokenD });
check(
  'subtasks hidden from task list',
  dList.data.total === 1 &&
    dList.data.tasks.every((t) => t.parentTaskId === null) &&
    dList.data.tasks[0].subtaskProgress.total === 2 &&
    dList.data.tasks[0].subtaskProgress.completed === 0
);

const cToggle = await req('PATCH', `/tasks/${st1Id}`, {
  token: tokenC,
  body: { status: 'completed' },
});
check('parent assignee can complete subtask', cToggle.status === 200);

const dDetail = await req('GET', `/tasks/${dTaskId}`, { token: tokenC });
check(
  'task details bundle subtasks and progress',
  dDetail.status === 200 &&
    dDetail.data.subtasks.length === 2 &&
    dDetail.data.task.subtaskProgress.completed === 1
);

const dUpdate = await req('PATCH', `/tasks/${dTaskId}`, {
  token: tokenD,
  body: { priority: 'high', dueAt: tomorrow },
});
check(
  'owner updates priority and due date',
  dUpdate.status === 200 &&
    dUpdate.data.task.priority === 'high' &&
    dUpdate.data.task.assignees.some((a) => a.id === userIdC)
);

const acts = await req('GET', `/tasks/${dTaskId}/activities`, { token: tokenC });
const actsData = acts.data.activities;
check(
  'activity log records creation with actor',
  acts.status === 200 &&
    actsData.some((a) => a.action === 'created' && a.actor?.name === 'Dave Tester')
);
check(
  'activity log records status change',
  actsData.some(
    (a) => a.action === 'status_changed' && a.oldValue === 'todo' && a.newValue === 'in_progress'
  )
);
check(
  'activity log records priority and due date changes',
  actsData.some((a) => a.action === 'priority_changed' && a.newValue === 'high') &&
    actsData.some((a) => a.action === 'due_at_changed' && a.newValue !== null)
);

const st1Acts = await req('GET', `/tasks/${st1Id}/activities`, { token: tokenC });
check(
  'subtask activity records actor',
  st1Acts.status === 200 &&
    st1Acts.data.activities.some((a) => a.action === 'status_changed' && a.actor?.name === 'Carol Tester')
);

const strayActs = await req('GET', `/tasks/${dTaskId}/activities`, { token: tokenB });
check('activities hidden from unrelated users', strayActs.status === 404);

const archParent = await req('DELETE', `/tasks/${dTaskId}`, { token: tokenD });
check('archive task with subtasks', archParent.status === 200);

const st1After = await req('GET', `/tasks/${st1Id}`, { token: tokenD });
check('archive cascades to subtasks', st1After.data.task.isArchived === true);

const restParent = await req('POST', `/tasks/${dTaskId}/restore`, { token: tokenD });
check('restore task with subtasks', restParent.status === 200);

const st1Restored = await req('GET', `/tasks/${st1Id}`, { token: tokenD });
check('restore cascades to subtasks', st1Restored.data.task.isArchived === false);

const dashD = await req('GET', '/dashboard/summary', { token: tokenD });
check(
  'dashboard counts exclude subtasks',
  dashD.status === 200 && dashD.data.summary.total === 1 && dashD.data.summary.inProgress === 1
);

