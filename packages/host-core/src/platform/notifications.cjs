// The adapter reports only outcomes explicitly observable from Electron.
function submitNotification(Notification,title,body,onOutcome){
  let reported=false;
  function report(outcome){
    if(reported)return;
    reported=true;
    onOutcome(outcome);
  }
  try{
    if(!Notification.isSupported()){report('unsupported');return;}
    const notice=new Notification({title,body});
    notice.once('failed',()=>report('failed'));
    notice.once('show',()=>report('shown'));
    notice.show();
  }catch{report('failed');}
}
module.exports={submitNotification};
