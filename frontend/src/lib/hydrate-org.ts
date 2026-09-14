/** After JWT login, pull org rows into the existing local UI stores. */
import { orgFetch, type AuthUser } from '@/lib/auth-api';

function writeEntities(kind: string, rows: Record<string, string>[]) {
  localStorage.setItem(`ielts-entities-${kind}`, JSON.stringify(rows));
}

export async function hydrateOrgFromBackend(user: AuthUser) {
  try {
    if (user.role === 'super_admin' || user.role === 'branch_admin' || user.role === 'teacher') {
      const users = await orgFetch<{ users: AuthUser[] }>('/org/users');
      const teachers = users.users
        .filter((u) => u.role === 'teacher')
        .map((u) => ({
          id: u.id,
          fullName: u.full_name || u.name || u.username,
          name: u.full_name || u.name || u.username,
          email: u.email,
          username: u.username,
          password: '',
          batches: u.batches || '',
          branchId: u.branch_id || u.branchId || '',
          branchName: '',
        }));
      const students = users.users
        .filter((u) => u.role === 'student')
        .map((u) => ({
          id: u.id,
          fullName: u.full_name || u.name || u.username,
          name: u.full_name || u.name || u.username,
          email: u.email,
          username: u.username,
          password: '',
          batch: u.batch || '',
          band: '',
          branchId: u.branch_id || u.branchId || '',
          branchName: '',
          status: 'Active',
          lastActive: 'Synced',
        }));
      writeEntities('teacher', teachers);
      writeEntities('student', students);

      const branches = await orgFetch<{ branches: any[] }>('/org/branches');
      localStorage.setItem('ielts-branches-v1', JSON.stringify(branches.branches || []));

      const batches = await orgFetch<{ batches: any[] }>('/org/batches');
      writeEntities(
        'batch',
        (batches.batches || []).map((b) => ({
          id: b.id,
          name: b.name,
          schedule: b.schedule || '',
          subjects: b.subjects || '',
          branchId: b.branchId || '',
          teacherId: b.teacherId || '',
          teacherName: '',
          students: String(b.students || 0),
          avg: b.avg || '—',
        }))
      );
    }
  } catch {
    /* offline hydrate is best-effort */
  }
}
