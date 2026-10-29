/**
 * Create the first administrator. There is deliberately no public sign-up route.
 *
 *   pnpm --filter api bootstrap:admin -- --email admin@example.com --username ama --name "Ama Mensah"
 *
 * By default Supabase emails an invitation link (the redirect goes to APP_URL/reset-password,
 * where the administrator chooses a password). With --password the account is created
 * with the password in the BOOTSTRAP_ADMIN_PASSWORD environment variable instead, so the
 * secret never appears in shell history.
 *
 * The script refuses to run when an active administrator already exists.
 */
import { parseArgs } from 'node:util';
import { passwordPolicy, SYSTEM_ROLES, usernameSchema } from '@tsm/shared';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { supabaseAdmin } from '../src/lib/supabase';
import { countActiveAdmins } from '../src/services/admin-guard';
import { syncPermissionCatalogue } from '../src/services/permission-catalogue';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      username: { type: 'string' },
      password: { type: 'boolean', default: false },
    },
  });
  const email = values.email?.trim().toLowerCase();
  const fullName = values.name?.trim();
  if (!email || !fullName || !values.username) {
    throw new Error('Usage: bootstrap:admin -- --email <email> --username <username> --name "<full name>" [--password]');
  }
  const usernameCheck = usernameSchema.safeParse(values.username);
  if (!usernameCheck.success) throw new Error(`--username: ${usernameCheck.error.issues[0]?.message}`);
  const username = usernameCheck.data;

  await syncPermissionCatalogue(prisma);
  const existingAdmins = await prisma.$transaction((tx) => countActiveAdmins(tx));
  if (existingAdmins > 0) {
    throw new Error('An active administrator already exists. Create further users from Admin → Users.');
  }

  const admin = supabaseAdmin().auth.admin;
  let authUserId: string;
  if (values.password) {
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
    const check = passwordPolicy.safeParse(password);
    if (!check.success) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD: ${check.error.issues[0]?.message}`);
    const { data, error } = await admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) throw new Error(`Supabase could not create the user: ${error?.message}`);
    authUserId = data.user.id;
  } else {
    const { data, error } = await admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${env().APP_URL}/reset-password`,
    });
    if (error || !data.user) throw new Error(`Supabase could not send the invitation: ${error?.message}`);
    authUserId = data.user.id;
  }

  const role = await prisma.role.findUniqueOrThrow({ where: { key: SYSTEM_ROLES.admin } });
  await prisma.$transaction(async (tx) => {
    const profile = await tx.userProfile.upsert({
      where: { authUserId },
      create: { authUserId, email, username, fullName },
      update: { isActive: true, deactivatedAt: null },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: profile.id, roleId: role.id } },
      create: { userId: profile.id, roleId: role.id },
      update: {},
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: 'user.bootstrap_admin',
        entityType: 'user',
        entityId: profile.id,
        summary: `Initial administrator ${email} created from the command line`,
      },
    });
  });
  console.log(
    values.password
      ? `Administrator ${email} created. Sign in with the password from BOOTSTRAP_ADMIN_PASSWORD.`
      : `Invitation sent to ${email}. The link opens the app so the administrator can choose a password.`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
