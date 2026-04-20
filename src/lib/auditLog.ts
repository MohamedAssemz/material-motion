import { supabase } from "@/integrations/supabase/client";

/**
 * Global audit log helper.
 *
 * Fire-and-forget: never throws, never blocks the caller.
 * Snapshots user_name/user_email at write time so historical entries
 * survive profile renames / user deletion.
 */

export type AuditEntry = {
  action: string; // e.g. "order.created", "batch.assigned_to_box"
  entity_type: string; // "order" | "batch" | "box" | "shipment" | ...
  entity_id?: string | null;
  module: string; // "orders" | "manufacturing" | "boxing" | ...
  order_id?: string | null;
  metadata?: Record<string, any>;
};

type UserSnapshot = {
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
};

let cachedUser: UserSnapshot | null = null;
let cachedUserId: string | null = null;

async function resolveUser(): Promise<UserSnapshot> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      cachedUser = { user_id: null, user_name: null, user_email: null };
      cachedUserId = null;
      return cachedUser;
    }

    if (cachedUser && cachedUserId === user.id) {
      return cachedUser;
    }

    let fullName: string | null = null;
    let email: string | null = user.email ?? null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      fullName = profile.full_name ?? null;
      email = profile.email ?? email;
    }

    cachedUser = {
      user_id: user.id,
      user_name: fullName ?? email ?? "Unknown",
      user_email: email,
    };
    cachedUserId = user.id;
    return cachedUser;
  } catch {
    return { user_id: null, user_name: null, user_email: null };
  }
}

async function insertOne(entry: AuditEntry, snapshot: UserSnapshot): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      user_id: snapshot.user_id,
      user_name: snapshot.user_name,
      user_email: snapshot.user_email,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      module: entry.module,
      order_id: entry.order_id ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    // Never throw from audit logging
    console.warn("[auditLog] insert failed", err);
  }
}

/**
 * Log an audit entry. Fire-and-forget — safe to call without await.
 */
export function logAudit(entry: AuditEntry): void {
  resolveUser()
    .then((snap) => insertOne(entry, snap))
    .catch((err) => console.warn("[auditLog] resolveUser failed", err));
}

/**
 * Log multiple audit entries in one user resolution pass.
 */
export function logAuditBatch(entries: AuditEntry[]): void {
  if (!entries.length) return;
  resolveUser()
    .then(async (snap) => {
      try {
        await supabase.from("audit_logs").insert(
          entries.map((entry) => ({
            user_id: snap.user_id,
            user_name: snap.user_name,
            user_email: snap.user_email,
            action: entry.action,
            entity_type: entry.entity_type,
            entity_id: entry.entity_id ?? null,
            module: entry.module,
            order_id: entry.order_id ?? null,
            metadata: entry.metadata ?? {},
          }))
        );
      } catch (err) {
        console.warn("[auditLog] batch insert failed", err);
      }
    })
    .catch((err) => console.warn("[auditLog] resolveUser failed", err));
}
