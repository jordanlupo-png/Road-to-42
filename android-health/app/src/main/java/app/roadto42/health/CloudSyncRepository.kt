package app.roadto42.health

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from

class CloudSyncRepository {
    private val supabase = RoadTo42Supabase.client

    suspend fun sync(records: List<ActivityUpload>): Int {
        val userId = supabase.auth.currentUserOrNull()?.id ?: error("Sign in to Road to 42 first")
        records.forEach { record ->
            supabase.from("activities").upsert(record.copy(userId = userId)) {
                onConflict = "user_id,source,external_id"
            }
        }
        return records.size
    }
}
