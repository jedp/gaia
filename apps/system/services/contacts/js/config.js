/* receive and store configuration settings via IAC API */

(function() {

'use strict';

navigator.mozSetMessageHandler('connection', function(connectionRequest) {
  if (connectionRequest.keyword !== 'contacts-backup-settings') {
    return;
  }

  // Received a message for us via IAC that contains new backup config.
  // Save the config data.
  var port = connectionRequest.port;
  port.onmessage = function(message) {
    var detail = message.data;
    switch (detail.action) {
      case 'enable':
        navigator.mozSettings.createLock().set({SYNC_ENABLED_PREF: detail.enabled});
        console.log('enable me? ' + detail.enabled);
        break;
      case 'configure':
        // XXX somehow we would get the id of the currently-signed-in fxa user in
        // here and add it to the message data.
        console.log('received data over iac: ' + JSON.stringify(detail));
        ContactsBackupStorage.save(detail);
        break;
      default:
        console.error("** bogus message: " + JSON.stringify(detail));
        break;
    }
  };

  port.start();
});

}());
