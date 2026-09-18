package app.roadto42.health

import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.FlowType
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest

object RoadTo42Supabase {
    val client = createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY) {
        install(Auth) {
            flowType = FlowType.PKCE
            scheme = "roadto42"
            host = "auth"
        }
        install(Postgrest)
    }
}
