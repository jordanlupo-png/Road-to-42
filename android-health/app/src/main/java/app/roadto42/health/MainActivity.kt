package app.roadto42.health

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.lifecycle.lifecycleScope
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
 private lateinit var health: HealthConnectClient
 private lateinit var status: TextView
 private lateinit var sync: Button
 private lateinit var healthButton: Button
 private lateinit var login: Button
 private val permissions=setOf(HealthPermission.getReadPermission(ExerciseSessionRecord::class),HealthPermission.getReadPermission(DistanceRecord::class),HealthPermission.getReadPermission(StepsRecord::class),HealthPermission.getReadPermission(HeartRateRecord::class))
 private val permissionLauncher=registerForActivityResult(PermissionController.createRequestPermissionResultContract()){updateState()}
 override fun onCreate(savedInstanceState: Bundle?){super.onCreate(savedInstanceState);val sdk=HealthConnectClient.getSdkStatus(this);if(sdk==HealthConnectClient.SDK_AVAILABLE)health=HealthConnectClient.getOrCreate(this)
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(7,23,43));setPadding(42,42,42,42);gravity=Gravity.CENTER_HORIZONTAL}
  val mark=TextView(this).apply{text="42";textSize=78f;gravity=Gravity.CENTER;setTextColor(Color.rgb(233,164,67));setPadding(0,45,0,0)}
  val title=TextView(this).apply{text="ROAD TO 42";textSize=31f;gravity=Gravity.CENTER;setTextColor(Color.WHITE)}
  val tag=TextView(this).apply{text="RUN  ·  IMPROVE  ·  BELONG";textSize=12f;gravity=Gravity.CENTER;setTextColor(Color.rgb(185,199,211));setPadding(0,8,0,45)}
  status=TextView(this).apply{textSize=16f;gravity=Gravity.CENTER;setTextColor(Color.WHITE);setPadding(10,20,10,28)}
  login=action("1  CONTINUE WITH GOOGLE"){lifecycleScope.launch{RoadTo42Supabase.client.auth.signInWith(Google)}}
  healthButton=action("2  CONNECT HEALTH"){permissionLauncher.launch(permissions)}.apply{isEnabled=sdk==HealthConnectClient.SDK_AVAILABLE}
  sync=action("3  SYNC MY RUNS"){syncNow()}.apply{isEnabled=false}
  val game=action("OPEN ROAD TO 42"){startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://jordanlupo-png.github.io/Road-to-42/")))}
  root.addView(mark);root.addView(title);root.addView(tag);root.addView(status);root.addView(login);root.addView(healthButton);root.addView(sync);root.addView(game);setContentView(root);updateState()
 }
 private fun action(label:String,click:()->Unit)=Button(this).apply{text=label;textSize=15f;isAllCaps=false;setOnClickListener{click()};layoutParams=LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.WRAP_CONTENT).apply{setMargins(0,8,0,8)}}
 override fun onResume(){super.onResume();updateState()}
 private fun updateState(){lifecycleScope.launch{val signed=RoadTo42Supabase.client.auth.currentUserOrNull()!=null;val available=HealthConnectClient.getSdkStatus(this@MainActivity)==HealthConnectClient.SDK_AVAILABLE;val granted=available&&health.permissionController.getGrantedPermissions().containsAll(permissions);status.text=when{!available->"Health Connect needs attention.";!signed->"Welcome. Sign in to connect your Road to 42 runner.";!granted->"Signed in ✓\nNow connect Health Connect.";else->"Road to 42 connected ✓\nHealth Connect connected ✓\nReady to sync your runs."};login.isEnabled=!signed;healthButton.isEnabled=available&&!granted;sync.isEnabled=signed&&granted}}
 private fun syncNow(){lifecycleScope.launch{sync.isEnabled=false;status.text="Reading your recent runs…";try{val runs=HealthConnectRepository(health).recentRuns();val count=CloudSyncRepository().sync(runs);status.text="Synced $count runs ✓\nYour XP dashboard is ready."}catch(e:Exception){status.text="Sync couldn't finish:\n"+(e.message?:"Unknown error")}finally{updateState()}}}
}