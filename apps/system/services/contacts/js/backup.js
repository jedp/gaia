/* Listener for contacts changes */

/* global FxAccountsClient */

(function() {

'use strict';

// Get Fruux config from settings
// teensy race condition here as we read from settings
var BACKUP_PROVIDERS = 'identity.services.contacts.providers';
var FRUUX_CONFIG = {};
var req = navigator.mozSettings.createLock().get(BACKUP_PROVIDERS);
req.onsuccess = function() {
  FRUUX_CONFIG = req.result[BACKUP_PROVIDERS].Fruux;
};

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

  customProvider: function (cb) {
    var url = localStorage.getItem('backup-url');
    var username = localStorage.getItem('backup-username');
    var password = localStorage.getItem('backup-password');

    // TODO: stop overridding these prefs
    url = 'http://localhost/owncloud/remote.php/carddav/addressbooks/francois/contacts';
    username = 'francois';
    password = 'francois';

    setTimeout(function () {
      cb(url, username, password);
    }, 0);
  },

  defaultProvider: function (cb) {
    console.log('Getting new fruux credentials...');

    // TODO: make sure .watch() only gets called once
    navigator.mozId.watch({
      wantIssuer: 'firefox-accounts',
      audience: FRUUX_CONFIG.url,
      loggedInUser: null,
      onready: function () {
        console.log('FxA is ready');
      },
      onerror: function () {
        console.log('FxA error :(');
      },
      onlogin: function (assertion) {
        console.log('got FxA assertion: ' + assertion);

        // TODO: save these transient credentials to localStorage to avoid
        // provisioning every time we need to push a contact

        var oReq = new XMLHttpRequest({ mozSystem: true });

        function reqListener() {
          var creds = JSON.parse(oReq.responseText); // TODO: check for errors

          // TODO: discover the addressbook URL (see Discovery on http://sabre.io/dav/building-a-carddav-client/)
          var url = FRUUX_CONFIG.url + creds.links['addressbook-home-set'] + 'default';

          cb(url, creds.basicAuth.userName, creds.basicAuth.password);
        }
        oReq.onload = reqListener;

        var data = {
          assertion: assertion
        };
        oReq.open('POST', FRUUX_CONFIG.url + '/browserid/login', true);
        oReq.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
        oReq.send(JSON.stringify(data));
      },
      onlogout: function () {
        console.log('user logged out of FxA');
      }
    });
    navigator.mozId.request();
  },

  upload: function(vcard) {
    var self = this;
    if (!self.enabled) {
      return;
    }

    var oReq = new XMLHttpRequest({ mozSystem: true });

    function reqListener() {
      console.log('contact pushed: ' + oReq.responseText);
      // TODO: check for failures and retry if necessary
    }
    oReq.onload = reqListener;

    var provider = localStorage.getItem('backup-provider');
    provider = 0; // TODO: stop overriding this pref
    var providerFunction;
    if (0 === provider) {
      providerFunction = self.defaultProvider;
    } else if (1 === provider) {
      providerFunction = self.customProvider;
    }

    providerFunction(function (url, username, password) {
      var fullURL = url + '/sample.vcf'; // TODO: generate unique name for the vcard
      console.log('Pushing contacts to: ' + fullURL + ' using ' + username + ':' + password);
      oReq.open('PUT', fullURL, true, username, password);
      oReq.setRequestHeader('Content-Type', 'text/vcard; charset=utf-8');
      oReq.send(vcard);
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
