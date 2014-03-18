/* Listener for contacts changes */

(function() {

'use strict';

function findContactById(contactID) {
  var options = {
    filterBy: ['id'],
    filterOp: 'equals',
    filterValue: contactID
  };
  var promise = new Promise(function done(resolve, reject) {
    var request = navigator.mozContacts.find(options);

    request.onsuccess = function(event) {
      var result = event.target.result[0];
      console.log('** found: ' + JSON.stringify(result));
      resolve(result);
    };

    request.onerror = function(error) {
      console.error('** got error: ' + error);
      reject(error);
    };
  });

  return promise;
}

var BackupService = {
  enabled: true,    // we'll set this with a pref later
  queue: [],

  init: function() {
    var self = this;

    navigator.mozContacts.oncontactchange = function(event) {
      if (this.enabled) {
        this.enqueue(event.contactID);
      }
    }.bind(this);
  },

  enqueue: function(contactID) {
    console.log('** here we would enqueue ' + contactID);
    findContactById(contactID).then(
      function resolve(result) {
        console.log('** yay! ' + JSON.stringify(result));
      },
      function reject(error) {
        console.error(error);
      }
    );
  },

};

BackupService.init();

}());
