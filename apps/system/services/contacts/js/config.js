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
    // XXX somehow we would get the id of the currently-signed-in fxa user in
    // here and add it to the message data.
    ContactsBackupStorage.save(message.data);
  };

  port.start();
});

}());
