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
  s.trend[6]?.date === todayUtc && s.trend[6]?.completed === 1,
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


// Phase 2b: scope filter and assignee removal
const regScoped = await req('POST', '/auth/register', {
  body: { name: 'Frank Scoped', email: `frank.${stamp}@example.com`, password: 'password123' },
});
const tokenScoped = regScoped.data.accessToken;
const userScoped = regScoped.data.user;

const fTask = await req('POST', '/tasks', {
  token: tokenD,
  body: { title: 'Scoped task', assigneeIds: [userScoped.id] },
});
check('setup scoped task', fTask.status === 201);
const fTaskId = fTask.data.task.id;

const fAssigned = await req('GET', '/tasks?scope=assigned', { token: tokenScoped });
check('scope=assigned lists task', fAssigned.data.tasks.some((t) => t.id === fTaskId));

const fOwned = await req('GET', '/tasks?scope=owned', { token: tokenScoped });
check('scope=owned excludes assigned-only task', !fOwned.data.tasks.some((t) => t.id === fTaskId));

const dOwnedList = await req('GET', '/tasks?scope=owned', { token: tokenD });
check('scope=owned lists owned task', dOwnedList.data.tasks.some((t) => t.id === fTaskId));

const badScope = await req('GET', '/tasks?scope=bogus', { token: tokenD });
check('invalid scope rejected', badScope.status === 400);

const dropF = await req('DELETE', `/tasks/${fTaskId}/assignees/${userScoped.id}`, { token: tokenD });
check('remove assignee', dropF.status === 200 && dropF.data.task.assignees.length === 0);

const fAfterDrop = await req('GET', `/tasks/${fTaskId}`, { token: tokenScoped });
check('removed assignee loses access', fAfterDrop.status === 404);

const dropAgain = await req('DELETE', `/tasks/${fTaskId}/assignees/${userScoped.id}`, { token: tokenD });
check('removing missing assignee is 404', dropAgain.status === 404);

// Phase 3: recurrence rules and per-occurrence tracking
const dayMs = 24 * 60 * 60 * 1000;
const todayStr = new Date().toISOString().slice(0, 10);
function utcDayStr(offsetDays) {
  return new Date(Date.parse(todayStr) + offsetDays * dayMs).toISOString().slice(0, 10);
}
function occOn(occurrences, dayStr) {
  return occurrences.find((o) => String(o.scheduledFor).slice(0, 10) === dayStr);
}

const regG = await req('POST', '/auth/register', {
  body: { name: 'Gina Recurring', email: `gina.${stamp}@example.com`, password: 'password123' },
});
const tokenG = regG.data.accessToken;
check('register user G (recurring owner)', regG.status === 201);

// Daily rule: create, occurrence generation, per-occurrence completion
const r1Res = await req('POST', '/tasks', {
  token: tokenG,
  body: {
    title: 'Practice JavaScript',
    recurrenceRule: { frequency: 'daily', interval: 1 },
  },
});
check(
  'create daily recurring task',
  r1Res.status === 201 &&
    r1Res.data.task.isRecurring === true &&
    r1Res.data.task.recurrenceRule?.frequency === 'daily'
);
const r1Id = r1Res.data.task.id;

const r1Occ = await req('GET', `/tasks/${r1Id}/occurrences`, { token: tokenG });
check(
  'occurrences generated around today',
  r1Occ.status === 200 &&
    Boolean(occOn(r1Occ.data.occurrences, todayStr)) &&
    Boolean(occOn(r1Occ.data.occurrences, utcDayStr(1)))
);
const r1Today = occOn(r1Occ.data.occurrences, todayStr);

const completeToday = await req('PATCH', `/occurrences/${r1Today.id}`, {
  token: tokenG,
  body: { status: 'completed' },
});
check(
  'complete today occurrence',
  completeToday.status === 200 &&
    completeToday.data.occurrence.status === 'completed' &&
    Boolean(completeToday.data.occurrence.completedAt)
);

const r1AfterComplete = await req('GET', `/tasks/${r1Id}`, { token: tokenG });
check(
  'completing occurrence does not complete the task',
  r1AfterComplete.data.task.status === 'todo'
);

const r1Occ2 = await req('GET', `/tasks/${r1Id}/occurrences`, { token: tokenG });
check(
  'next occurrence stays pending',
  occOn(r1Occ2.data.occurrences, utcDayStr(1))?.status === 'pending'
);

const reopenToday = await req('PATCH', `/occurrences/${r1Today.id}`, {
  token: tokenG,
  body: { status: 'pending' },
});
check(
  'reopen completed occurrence',
  reopenToday.status === 200 &&
    reopenToday.data.occurrence.status === 'pending' &&
    reopenToday.data.occurrence.completedAt === null
);

const skipTomorrow = await req('PATCH', `/occurrences/${occOn(r1Occ2.data.occurrences, utcDayStr(1)).id}`, {
  token: tokenG,
  body: { status: 'skipped' },
});
check('skip future occurrence', skipTomorrow.status === 200 && skipTomorrow.data.occurrence.status === 'skipped');

const unskipTomorrow = await req('PATCH', `/occurrences/${occOn(r1Occ2.data.occurrences, utcDayStr(1)).id}`, {
  token: tokenG,
  body: { status: 'pending' },
});
check('unskip occurrence', unskipTomorrow.status === 200 && unskipTomorrow.data.occurrence.status === 'pending');

// Missed sweep: task anchored 5 days in the past
const r2Res = await req('POST', '/tasks', {
  token: tokenG,
  body: {
    title: 'Morning run',
    startAt: new Date(Date.parse(todayStr) - 5 * dayMs).toISOString(),
    recurrenceRule: { frequency: 'daily' },
  },
});
const r2Id = r2Res.data.task.id;
const r2Occ = await req('GET', `/tasks/${r2Id}/occurrences`, { token: tokenG });
const r2Missed = r2Occ.data.occurrences.filter((o) => o.status === 'missed');
check(
  'past pending occurrences marked missed',
  r2Missed.length === 5 && occOn(r2Occ.data.occurrences, todayStr)?.status === 'pending'
);

const lateComplete = await req('PATCH', `/occurrences/${occOn(r2Occ.data.occurrences, utcDayStr(-2)).id}`, {
  token: tokenG,
  body: { status: 'completed' },
});
check(
  'late completion of missed occurrence',
  lateComplete.status === 200 && lateComplete.data.occurrence.status === 'completed'
);

const reopenMissed = await req('PATCH', `/occurrences/${occOn(r2Occ.data.occurrences, utcDayStr(-1)).id}`, {
  token: tokenG,
  body: { status: 'pending' },
});
check('missed occurrence cannot be reopened', reopenMissed.status === 400);

const gDash = await req('GET', '/dashboard/summary', { token: tokenG });
check(
  'dashboard reports missed occurrences',
  gDash.status === 200 && gDash.data.summary.missedOccurrences === 4
);

// Weekly rule semantics
const r3Res = await req('POST', '/tasks', {
  token: tokenG,
  body: {
    title: 'Gym with coach',
    recurrenceRule: { frequency: 'weekly', byWeekday: [1, 3] },
  },
});
check('create weekly recurring task', r3Res.status === 201);
const r3Occ = await req('GET', `/tasks/${r3Res.data.task.id}/occurrences`, { token: tokenG });
const r3Days = r3Occ.data.occurrences.map((o) => new Date(o.scheduledFor).getUTCDay());
check(
  'weekly occurrences land only on chosen weekdays',
  r3Occ.data.occurrences.length >= 8 && r3Days.every((d) => d === 1 || d === 3)
);

const weeklyNoDays = await req('POST', '/tasks', {
  token: tokenG,
  body: { title: 'Broken weekly', recurrenceRule: { frequency: 'weekly' } },
});
check('weekly rule requires byWeekday', weeklyNoDays.status === 400);

const badFreq = await req('POST', '/tasks', {
  token: tokenG,
  body: { title: 'Broken rule', recurrenceRule: { frequency: 'hourly' } },
});
check('invalid frequency rejected', badFreq.status === 400);

// until caps expansion
const r4Res = await req('POST', '/tasks', {
  token: tokenG,
  body: {
    title: 'Short streak',
    recurrenceRule: { frequency: 'daily', until: utcDayStr(3) },
  },
});
const r4Occ = await req('GET', `/tasks/${r4Res.data.task.id}/occurrences`, { token: tokenG });
check('until caps occurrence count', r4Occ.data.occurrences.length === 4);

// Sharing: assignee can complete occurrences but not change the rule
const r5Res = await req('POST', '/tasks', {
  token: tokenG,
  body: {
    title: 'Team standup prep',
    assigneeIds: [userIdC],
    recurrenceRule: { frequency: 'daily' },
  },
});
const r5Id = r5Res.data.task.id;
const r5Occ = await req('GET', `/tasks/${r5Id}/occurrences`, { token: tokenG });
const cCompletes = await req('PATCH', `/occurrences/${occOn(r5Occ.data.occurrences, todayStr).id}`, {
  token: tokenC,
  body: { status: 'completed' },
});
check('assignee can complete an occurrence', cCompletes.status === 200);

const cRuleChange = await req('PATCH', `/tasks/${r5Id}`, {
  token: tokenC,
  body: { recurrenceRule: null },
});
check('assignee cannot change recurrence rule', cRuleChange.status === 403);

const bSeesOcc = await req('GET', `/tasks/${r5Id}/occurrences`, { token: tokenB });
check('outsider cannot list occurrences', bSeesOcc.status === 404);

const bPatchesOcc = await req('PATCH', `/occurrences/${occOn(r5Occ.data.occurrences, utcDayStr(1)).id}`, {
  token: tokenB,
  body: { status: 'completed' },
});
check('outsider cannot update occurrence', bPatchesOcc.status === 404);

// Idempotent manual occurrence creation
const manual1 = await req('POST', `/tasks/${r1Id}/occurrences`, {
  token: tokenG,
  body: { scheduledFor: utcDayStr(100) },
});
const manual2 = await req('POST', `/tasks/${r1Id}/occurrences`, {
  token: tokenG,
  body: { scheduledFor: utcDayStr(100) },
});
check(
  'manual occurrence creation is idempotent',
  manual1.status === 201 && manual2.status === 200 && manual1.data.occurrence.id === manual2.data.occurrence.id
);

const noDateOcc = await req('POST', `/tasks/${r1Id}/occurrences`, { token: tokenG, body: {} });
check('manual occurrence requires scheduledFor', noDateOcc.status === 400);

// Rule change rebuilds the future, keeps history
const reshape = await req('PATCH', `/tasks/${r2Id}`, {
  token: tokenG,
  body: { recurrenceRule: { frequency: 'weekly', byWeekday: [2] } },
});
check('owner can change recurrence rule', reshape.status === 200 && reshape.data.task.recurrenceRule.frequency === 'weekly');

const r2Reshaped = await req('GET', `/tasks/${r2Id}/occurrences`, { token: tokenG });
const r2Future = r2Reshaped.data.occurrences.filter((o) => String(o.scheduledFor).slice(0, 10) >= todayStr);
check(
  'future occurrences follow the new rule',
  r2Future.length > 0 && r2Future.every((o) => new Date(o.scheduledFor).getUTCDay() === 2)
);
check(
  'past occurrence history survives rule change',
  occOn(r2Reshaped.data.occurrences, utcDayStr(-2))?.status === 'completed'
);

// Clearing the rule removes recurrence but keeps completed history
const clearRule = await req('PATCH', `/tasks/${r2Id}`, {
  token: tokenG,
  body: { recurrenceRule: null },
});
check('clear recurrence rule', clearRule.status === 200 && clearRule.data.task.isRecurring === false);

const r2Cleared = await req('GET', `/tasks/${r2Id}/occurrences`, { token: tokenG });
check('cleared rule lists no occurrences', r2Cleared.status === 200 && r2Cleared.data.occurrences.length === 0);

const restoreRule = await req('PATCH', `/tasks/${r2Id}`, {
  token: tokenG,
  body: { recurrenceRule: { frequency: 'daily' } },
});
const r2Restored = await req('GET', `/tasks/${r2Id}/occurrences`, { token: tokenG });
check(
  'completed history survives clear and restore',
  restoreRule.status === 200 &&
    occOn(r2Restored.data.occurrences, utcDayStr(-2))?.status === 'completed'
);

// Subtasks cannot be recurring
const recSubtask = await req('POST', `/tasks/${r1Id}/subtasks`, {
  token: tokenG,
  body: { title: 'Nope', recurrenceRule: { frequency: 'daily' } },
});
check('subtask cannot be recurring', recSubtask.status === 400);

// Phase 5: comments, notifications, reminders, team permissions
const emailE = `erin.${stamp}@example.com`;
const emailF = `frank.p5.${stamp}@example.com`;

const regE = await req('POST', '/auth/register', {
  body: { name: 'Erin Owner', email: emailE, password: 'password123' },
});
const tokenE = regE.data.accessToken;
check('register user E (owner)', regE.status === 201);

const regF = await req('POST', '/auth/register', {
  body: { name: 'Frank Assignee', email: emailF, password: 'password123' },
});
const tokenF = regF.data.accessToken;
const userIdF = regF.data.user.id;
check('register user F (assignee)', regF.status === 201);

// Assignment notifications
const t5Res = await req('POST', '/tasks', {
  token: tokenE,
  body: { title: 'Ship the team workflow', assigneeIds: [userIdF] },
});
const t5Id = t5Res.data.task.id;
check('create task for team workflow', t5Res.status === 201);

const fNotifs1 = await req('GET', '/notifications', { token: tokenF });
const assignedNotif = fNotifs1.data.notifications.find(
  (n) => n.type === 'assigned' && n.task?.id === t5Id
);
check('assignee notified about assignment', fNotifs1.status === 200 && Boolean(assignedNotif));
check('assignment notification starts unread', assignedNotif?.readAt === null);

const fNotifs2 = await req('GET', '/notifications', { token: tokenF });
check(
  'assignment notification is not duplicated by repeated reads',
  fNotifs2.data.notifications.filter((n) => n.type === 'assigned' && n.task?.id === t5Id).length === 1
);

const eNotifs1 = await req('GET', '/notifications', { token: tokenE });
check(
  'owner is not notified about their own assignment action',
  !eNotifs1.data.notifications.some((n) => n.type === 'assigned' && n.task?.id === t5Id)
);

// Mark-read flow
const markRead = await req('PATCH', `/notifications/${assignedNotif.id}/read`, { token: tokenF });
check('mark notification read', markRead.status === 200 && Boolean(markRead.data.notification.readAt));

const markReadAgain = await req('PATCH', `/notifications/${assignedNotif.id}/read`, { token: tokenF });
check(
  're-reading keeps the original readAt',
  markReadAgain.status === 200 &&
    markReadAgain.data.notification.readAt === markRead.data.notification.readAt
);

const eReadsF = await req('PATCH', `/notifications/${assignedNotif.id}/read`, { token: tokenE });
check('cannot read another user notification', eReadsF.status === 404);

const bogusRead = await req('PATCH', '/notifications/not-an-id/read', { token: tokenF });
check('invalid notification id rejected', bogusRead.status === 404);

// Reminder before due date (offset already elapsed, task not yet overdue)
const remTaskRes = await req('POST', '/tasks', {
  token: tokenE,
  body: {
    title: 'Reminder fires',
    dueAt: new Date(Date.now() + 30 * 60000).toISOString(),
    reminderMinutesBefore: 60,
    assigneeIds: [userIdF],
  },
});
const remTaskId = remTaskRes.data.task.id;
check(
  'reminder stored on task',
  remTaskRes.status === 201 && remTaskRes.data.task.reminderMinutesBefore === 60
);

const eNotifs2 = await req('GET', '/notifications', { token: tokenE });
check(
  'due reminder materializes on read',
  eNotifs2.data.notifications.some((n) => n.type === 'reminder' && n.task?.id === remTaskId)
);

const fNotifs3 = await req('GET', '/notifications', { token: tokenF });
check(
  'assignees get the reminder too',
  fNotifs3.data.notifications.some((n) => n.type === 'reminder' && n.task?.id === remTaskId)
);
check(
  'task not flagged overdue before its due time',
  !fNotifs3.data.notifications.some((n) => n.type === 'overdue' && n.task?.id === remTaskId)
);

const eNotifs3 = await req('GET', '/notifications', { token: tokenE });
check(
  'reminder sweep is idempotent',
  eNotifs3.data.notifications.filter((n) => n.type === 'reminder' && n.task?.id === remTaskId).length === 1
);

// Overdue alert (reminder offset also elapsed, but overdue supersedes it)
const overRes = await req('POST', '/tasks', {
  token: tokenE,
  body: {
    title: 'Long overdue',
    dueAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    reminderMinutesBefore: 30,
    assigneeIds: [userIdF],
  },
});
const overId = overRes.data.task.id;
const eNotifs4 = await req('GET', '/notifications', { token: tokenE });
check(
  'overdue alert materializes',
  eNotifs4.data.notifications.some((n) => n.type === 'overdue' && n.task?.id === overId)
);
check(
  'overdue supersedes the reminder',
  !eNotifs4.data.notifications.some((n) => n.type === 'reminder' && n.task?.id === overId)
);

// Moving the schedule retires stale unread reminders and does not pre-fire the new one
const moved = await req('PATCH', `/tasks/${remTaskId}`, {
  token: tokenE,
  body: { dueAt: new Date(Date.now() + 5 * 86400000).toISOString() },
});
const eNotifs5 = await req('GET', '/notifications', { token: tokenE });
check(
  'schedule change retires the stale unread reminder',
  moved.status === 200 &&
    !eNotifs5.data.notifications.some((n) => n.type === 'reminder' && n.task?.id === remTaskId)
);

// Reminder validation and permissions
const noDueReminder = await req('POST', '/tasks', {
  token: tokenE,
  body: { title: 'Reminder without due', reminderMinutesBefore: 60 },
});
check('reminder requires a due date', noDueReminder.status === 400);

const bigOffset = await req('POST', '/tasks', {
  token: tokenE,
  body: {
    title: 'Huge offset',
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    reminderMinutesBefore: 999999,
  },
});
check('reminder offset is bounded', bigOffset.status === 400);

const assigneeReminder = await req('PATCH', `/tasks/${t5Id}`, {
  token: tokenF,
  body: { reminderMinutesBefore: 60 },
});
check('assignee cannot set reminders', assigneeReminder.status === 403);

const clearDue = await req('PATCH', `/tasks/${remTaskId}`, {
  token: tokenE,
  body: { dueAt: null },
});
check(
  'clearing dueAt clears the reminder',
  clearDue.status === 200 && clearDue.data.task.reminderMinutesBefore === null
);

// Comments: CRUD + permissions
const noAuthComments = await req('GET', `/tasks/${t5Id}/comments`);
check('comments require auth', noAuthComments.status === 401);

const emptyComment = await req('POST', `/tasks/${t5Id}/comments`, { token: tokenF, body: {} });
check('empty comment rejected', emptyComment.status === 400);

const longComment = await req('POST', `/tasks/${t5Id}/comments`, {
  token: tokenF,
  body: { body: 'x'.repeat(1001) },
});
check('over-long comment rejected', longComment.status === 400);

const fComment = await req('POST', `/tasks/${t5Id}/comments`, {
  token: tokenF,
  body: { body: 'Kickoff done, starting on the API.' },
});
check(
  'assignee can comment',
  fComment.status === 201 && fComment.data.comment.author.name === 'Frank Assignee'
);
const fCommentId = fComment.data.comment.id;
check('author may delete own comment', fComment.data.comment.canDelete === true);

const eComment = await req('POST', `/tasks/${t5Id}/comments`, {
  token: tokenE,
  body: { body: 'Great, ping me for review.' },
});
check('owner can comment', eComment.status === 201);
const eCommentId = eComment.data.comment.id;

const bReadsComments = await req('GET', `/tasks/${t5Id}/comments`, { token: tokenB });
check('outsider cannot read comments', bReadsComments.status === 404);

const bPostsComment = await req('POST', `/tasks/${t5Id}/comments`, {
  token: tokenB,
  body: { body: 'hello' },
});
check('outsider cannot comment', bPostsComment.status === 404);

const fListComments = await req('GET', `/tasks/${t5Id}/comments`, { token: tokenF });
check(
  'comments listed oldest first for assignees',
  fListComments.status === 200 &&
    fListComments.data.comments.length === 2 &&
    fListComments.data.comments[0].id === fCommentId
);
check(
  'non-author cannot delete the owner comment',
  fListComments.data.comments[1].id === eCommentId &&
    fListComments.data.comments[1].canDelete === false
);

const ownerDeletesF = await req('DELETE', `/tasks/${t5Id}/comments/${fCommentId}`, { token: tokenE });
check('owner can delete an assignee comment', ownerDeletesF.status === 204);

const fDeletesOwner = await req('DELETE', `/tasks/${t5Id}/comments/${eCommentId}`, { token: tokenF });
check('assignee cannot delete the owner comment', fDeletesOwner.status === 403);

const fComment2 = await req('POST', `/tasks/${t5Id}/comments`, {
  token: tokenF,
  body: { body: 'One more thought, then done.' },
});
const fDeletesOwn = await req('DELETE', `/tasks/${t5Id}/comments/${fComment2.data.comment.id}`, {
  token: tokenF,
});
check('author can delete own comment', fDeletesOwn.status === 204);

// Comment notifications: recipients exclude the author, deleted comments clean up
const eNotifs6 = await req('GET', '/notifications', { token: tokenE });
check(
  'deleted comments leave no notifications behind',
  !eNotifs6.data.notifications.some((n) => n.type === 'comment' && n.task?.id === t5Id)
);

const fNotifs4 = await req('GET', '/notifications', { token: tokenF });
const fCommentNotifs = fNotifs4.data.notifications.filter(
  (n) => n.type === 'comment' && n.task?.id === t5Id
);
check(
  'assignee notified exactly once about the owner comment',
  fCommentNotifs.length === 1 && fCommentNotifs[0].readAt === null
);

// Read-all
const readAll = await req('POST', '/notifications/read-all', { token: tokenF });
check('mark all read', readAll.status === 200 && readAll.data.updated >= 1);
const fNotifs5 = await req('GET', '/notifications', { token: tokenF });
check('unread count is zero after read-all', fNotifs5.data.unreadCount === 0);

// Editing assignees through PATCH (the task form path) changes membership and notifies new assignees
const regH = await req('POST', '/auth/register', {
  body: { name: 'Henry Newcomer', email: `henry.${stamp}@example.com`, password: 'password123' },
});
const tokenH = regH.data.accessToken;
const userIdH = regH.data.user.id;

const reassign = await req('PATCH', `/tasks/${t5Id}`, {
  token: tokenE,
  body: { assigneeIds: [userIdF, userIdH] },
});
check(
  'owner can edit assignees via PATCH',
  reassign.status === 200 &&
    reassign.data.task.assignees.length === 2 &&
    reassign.data.task.assignees.some((a) => a.id === userIdH)
);

const hNotifs = await req('GET', '/notifications', { token: tokenH });
check(
  'newly added assignee is notified',
  hNotifs.data.notifications.some((n) => n.type === 'assigned' && n.task?.id === t5Id)
);

const fNotifs6 = await req('GET', '/notifications', { token: tokenF });
check(
  'existing assignee is not re-notified',
  fNotifs6.data.notifications.filter((n) => n.type === 'assigned' && n.task?.id === t5Id).length === 1
);

const removeH = await req('DELETE', `/tasks/${t5Id}/assignees/${userIdH}`, { token: tokenE });
check(
  'owner can remove an assignee',
  removeH.status === 200 && removeH.data.task.assignees.length === 1
);

// Archived tasks are read-only for comments
const archTask = await req('POST', '/tasks', { token: tokenE, body: { title: 'Archive me' } });
const archId = archTask.data.task.id;
await req('DELETE', `/tasks/${archId}`, { token: tokenE });
const archComment = await req('POST', `/tasks/${archId}/comments`, {
  token: tokenE,
  body: { body: 'too late' },
});
check('cannot comment on an archived task', archComment.status === 400);

// Phase 6: time tracking and dashboard analytics
const t6Res = await req('POST', '/tasks', {
  token: tokenE,
  body: { title: 'Time the work', assigneeIds: [userIdF], estimatedDurationMinutes: 120 },
});
const t6Id = t6Res.data.task.id;
check('setup timed task', t6Res.status === 201);

const noAuthTimer = await req('POST', `/tasks/${t6Id}/timer/start`, {});
check('timer start requires auth', noAuthTimer.status === 401);

const start1 = await req('POST', `/tasks/${t6Id}/timer/start`, { token: tokenE });
check('owner starts a timer', start1.status === 201 && start1.data.entry.running === true);

const active1 = await req('GET', '/timer/active', { token: tokenE });
check('active timer is visible to its user', active1.data.entry?.taskId === t6Id);

const activeNone = await req('GET', '/timer/active', { token: tokenF });
check('other users have no active timer', activeNone.data.entry === null);

const startF = await req('POST', `/tasks/${t6Id}/timer/start`, { token: tokenF });
check('assignee starts their own timer', startF.status === 201);

const t6b = await req('POST', '/tasks', { token: tokenE, body: { title: 'Second timed task' } });
const t6bId = t6b.data.task.id;
const start2 = await req('POST', `/tasks/${t6bId}/timer/start`, { token: tokenE });
check(
  'starting another timer auto-stops the previous one',
  start2.status === 201 &&
    start2.data.stopped !== null &&
    start2.data.stopped.entry.taskId === t6Id
);

const t6After = await req('GET', `/tasks/${t6Id}`, { token: tokenE });
check('auto-stopped entry logs at least a minute', t6After.data.task.timeSpentMinutes >= 1);

const stop2 = await req('POST', `/tasks/${t6bId}/timer/stop`, { token: tokenE });
check(
  'stopping a timer closes the entry',
  stop2.status === 200 && stop2.data.entry.running === false && stop2.data.entry.durationMinutes >= 1
);

const stopAgain = await req('POST', `/tasks/${t6bId}/timer/stop`, { token: tokenE });
check('stopping without a running timer is 404', stopAgain.status === 404);

const stopF = await req('POST', `/tasks/${t6Id}/timer/stop`, { token: tokenF });
check('assignee stops their own timer', stopF.status === 200);

const startOutsider = await req('POST', `/tasks/${t6Id}/timer/start`, { token: tokenB });
check('outsider cannot start a timer', startOutsider.status === 404);

const manualBad = await req('POST', `/tasks/${t6Id}/time-entries`, {
  token: tokenE,
  body: { minutes: 0 },
});
check('manual entry rejects zero minutes', manualBad.status === 400);

const manualBig = await req('POST', `/tasks/${t6Id}/time-entries`, {
  token: tokenE,
  body: { minutes: 5000 },
});
check('manual entry rejects over a day', manualBig.status === 400);

const manual = await req('POST', `/tasks/${t6Id}/time-entries`, {
  token: tokenF,
  body: { minutes: 45, notes: 'Paired review' },
});
check(
  'assignee logs manual time',
  manual.status === 201 && manual.data.entry.durationMinutes === 45 && manual.data.entry.source === 'manual'
);

const entries = await req('GET', `/tasks/${t6Id}/time-entries`, { token: tokenE });
check(
  'entries list and logged total',
  entries.status === 200 && entries.data.entries.length === 3 && entries.data.totalMinutes >= 47
);

const entriesOutsider = await req('GET', `/tasks/${t6Id}/time-entries`, { token: tokenB });
check('outsider cannot read time entries', entriesOutsider.status === 404);

const complete6 = await req('PATCH', `/tasks/${t6bId}`, {
  token: tokenE,
  body: { status: 'completed' },
});
check('complete the second timed task', complete6.status === 200);

const timeCompleted = await req('POST', `/tasks/${t6bId}/timer/start`, { token: tokenE });
check('completed tasks cannot be timed', timeCompleted.status === 400);

const t6c = await req('POST', '/tasks', { token: tokenE, body: { title: 'Complete with running timer' } });
const t6cId = t6c.data.task.id;
await req('POST', `/tasks/${t6cId}/timer/start`, { token: tokenE });
const completeRunning = await req('PATCH', `/tasks/${t6cId}`, {
  token: tokenE,
  body: { status: 'completed' },
});
const activeAfterComplete = await req('GET', '/timer/active', { token: tokenE });
check(
  'completing a task stops its running timer',
  completeRunning.status === 200 && activeAfterComplete.data.entry === null
);

const arch6 = await req('POST', '/tasks', { token: tokenE, body: { title: 'Archive timed' } });
const arch6Id = arch6.data.task.id;
await req('DELETE', `/tasks/${arch6Id}`, { token: tokenE });
const timeArchived = await req('POST', `/tasks/${arch6Id}/timer/start`, { token: tokenE });
check('archived tasks cannot be timed', timeArchived.status === 400);

const dash6 = await req('GET', '/dashboard/summary', { token: tokenE });
const s6 = dash6.data.summary;
check(
  'summary trend includes created, completed and minutes',
  s6.trend.every((d) => 'created' in d && 'completed' in d && 'minutes' in d)
);
check('summary includes a category breakdown', Array.isArray(s6.byCategory));
check(
  'summary includes estimated vs logged totals',
  s6.timeEstimatedMinutes === 120 && s6.timeLoggedMinutes >= 47
);

const dashF6 = await req('GET', '/dashboard/summary', { token: tokenF });
check(
  'weekly minutes reflect the logged time',
  dashF6.data.summary.trend.reduce((sum, d) => sum + d.minutes, 0) >= 46
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
