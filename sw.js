'use strict';
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{data={body:event.data?.text()||'New Road to 42 activity'}}
 const title=data.title||'Road to 42';
 const options={body:data.body||'Your running community has an update.',icon:'assets/brand/icon-192.png',badge:'assets/brand/icon-192.png',tag:data.tag||'road42-community',renotify:true,data:{url:data.url||'./'}};
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
  if(windows.some(client=>client.visibilityState==='visible'))return;
  return self.registration.showNotification(title,options);
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL(event.notification.data?.url||'./',self.location.origin).href;
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
  for(const client of windows){if(client.url.startsWith(new URL('./',self.location).href)){client.navigate(target);return client.focus()}}
  return clients.openWindow(target);
 }));
});
