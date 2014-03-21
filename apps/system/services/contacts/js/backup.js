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

  upload: function(vcard) {
    var oReq = new XMLHttpRequest({ mozSystem: true });

    function reqListener() {
      console.log('contact pushed: ' + oReq.responseText);
    }

    var settingURL = new SettingsHelper('services.fxaccounts.contacts.url');
    settingURL.get(function on_ct_get_url(url) {
      var settingUsername = new SettingsHelper('services.fxaccounts.contacts.username');
      settingUsername.get(function on_ct_get_username(username) {
        var settingPassword = new SettingsHelper('services.fxaccounts.contacts.password');
        settingPassword.get(function on_ct_get_password(password) {
          oReq.onload = reqListener;
          var fullURL = url + '/sample.vcf'; // TODO: generate unique name for the vcard
          console.log("Pushing contacts to: " + fullURL);
          oReq.open("PUT", fullURL, true, username, password);
          oReq.setRequestHeader('Content-Type', 'text/vcard; charset=utf-8');
          oReq.send(vcard);
        });
      });
    });
  },

  backup: function() {
    var contactID = this.queue.shift();
    var self = this;
    if (!contactID) {
      return;
    }

    findContactById(contactID).then(
      function resolve(result) {
        try {
          var vcard = new MozContactTranslator(result).toString();
          console.log("** yay: " + vcard);
          self.upload(vcard);
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
