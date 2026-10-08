'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { login as doLogin, deleteSession, setSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } from '../auth';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: 'Invalid email or password' };
  }

  const result = await doLogin(parsed.data.email, parsed.data.password);
  if (!result) {
    return { error: 'Invalid email or password' };
  }

  const cookieStore = await cookies();
  const cookie = setSessionCookie(result.token);
  cookieStore.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });

  redirect('/workspaces');
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await deleteSession(token);
  }

  const cookie = clearSessionCookie();
  cookieStore.set(cookie.name, cookie.value, { maxAge: cookie.maxAge });

  redirect('/login');
}
