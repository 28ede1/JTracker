// ---------------------------------------------------------------------------
// Sign-Out service
//
// similar structure as Sign Up service, see signup.service.ts
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase'

export type SignOutResult =
    | {ok: true}
    | {ok:false, message: string}

export async function signOut(
    client: SupabaseClient = supabase,
    ): Promise<SignOutResult> {
    const { error } = await client.auth.signOut()
    if (error) {
        return { ok: false, message: error.message }
    }
    return { ok: true }
}