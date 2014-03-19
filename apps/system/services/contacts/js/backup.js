/* Listener for contacts changes */

(function() {

'use strict';

// Find a single contact by id - returns promise
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
      resolve(result);
    };

    request.onerror = reject;
  });

  return promise;
}

var BackupService = {
  enabled: true,    // we'll set this with a pref later
  queue: [],

  init: function() {
    var self = this;

    navigator.mozContacts.oncontactchange = function(event) {
      if (self.enabled) {
        self.enqueue(event.contactID);
        self.process();
      }
    };
  },

  enqueue: function(contactID) {
    var self = this;
    if (this.queue.indexOf(contactID)) {
      this.queue = this.queue.splice(this.queue.indexOf(contactID), 1);
    }
    this.queue.push(contactID);
  },

  process: function(delay) {
    delay = delay || 0;
    var self = this;

    setTimeout(function later() {
      self.backup();
    }, delay);
  },

  backup: function() {
    var contactID = this.queue.shift();
    if (!contactID) {
      return;
    }

    findContactById(contactID).then(
      function resolve(result) {
        try {
          var vcard = new MozContactTranslator(result).toString();
          console.log("** yay: " + vcard);
        } catch(err) {
          console.error(err);
        }
      },
      function reject(error) {
        console.error(error);
        self.enqueue(contactID);
        self.process(1000);
      }
    );
  },
};

BackupService.init();

}());
