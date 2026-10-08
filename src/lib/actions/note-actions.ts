'use server';

import { z } from 'zod';
import { requireSession } from '../auth';
import { withTenantContext } from '../db';
import { getMembership } from '../dal/members';
import * as notesDal from '../dal/notes';

const UUIDSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');

const CreateNoteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
});

const UpdateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(50000).optional(),
});

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; status: number };

function notFound(): ActionResult<never> {
  return { success: false, error: 'Not found', status: 404 };
}

function forbidden(): ActionResult<never> {
  return { success: false, error: 'Forbidden', status: 403 };
}

export async function listNotesAction(
  workspaceId: string,
  projectId: string
): Promise<ActionResult<notesDal.Note[]>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  const pId = UUIDSchema.safeParse(projectId);
  if (!wsId.success || !pId.success) return notFound();

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();

    const notes = await notesDal.listNotes(client, wsId.data, pId.data);
    return { success: true, data: notes };
  });
}

export async function getNoteAction(
  workspaceId: string,
  projectId: string,
  noteId: string
): Promise<ActionResult<notesDal.Note>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  const pId = UUIDSchema.safeParse(projectId);
  const nId = UUIDSchema.safeParse(noteId);
  if (!wsId.success || !pId.success || !nId.success) return notFound();

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();

    const note = await notesDal.getNote(client, wsId.data, pId.data, nId.data);
    if (!note) return notFound();
    return { success: true, data: note };
  });
}

export async function createNoteAction(
  workspaceId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult<notesDal.Note>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  const pId = UUIDSchema.safeParse(projectId);
  if (!wsId.success || !pId.success) return notFound();

  const parsed = CreateNoteSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  });
  if (!parsed.success) {
    return { success: false, error: 'Title and content are required', status: 400 };
  }

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();
    if (membership.role === 'viewer') return forbidden();

    const note = await notesDal.createNote(
      client, wsId.data, pId.data, parsed.data.title, parsed.data.content
    );
    if (!note) return notFound();
    return { success: true, data: note };
  });
}

export async function updateNoteAction(
  workspaceId: string,
  projectId: string,
  noteId: string,
  formData: FormData
): Promise<ActionResult<notesDal.Note>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  const pId = UUIDSchema.safeParse(projectId);
  const nId = UUIDSchema.safeParse(noteId);
  if (!wsId.success || !pId.success || !nId.success) return notFound();

  const parsed = UpdateNoteSchema.safeParse({
    title: formData.get('title') || undefined,
    content: formData.get('content') || undefined,
  });
  if (!parsed.success || (!parsed.data.title && !parsed.data.content)) {
    return { success: false, error: 'At least one field to update is required', status: 400 };
  }

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();
    if (membership.role === 'viewer') return forbidden();

    const note = await notesDal.updateNote(
      client, wsId.data, pId.data, nId.data, parsed.data
    );
    if (!note) return notFound();
    return { success: true, data: note };
  });
}

export async function deleteNoteAction(
  workspaceId: string,
  projectId: string,
  noteId: string
): Promise<ActionResult<void>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  const pId = UUIDSchema.safeParse(projectId);
  const nId = UUIDSchema.safeParse(noteId);
  if (!wsId.success || !pId.success || !nId.success) return notFound();

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();
    if (membership.role === 'viewer') return forbidden();

    const deleted = await notesDal.deleteNote(client, wsId.data, pId.data, nId.data);
    if (!deleted) return notFound();
    return { success: true, data: undefined };
  });
}
