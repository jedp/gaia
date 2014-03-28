/* Listener for contacts changes */

(function() {

'use strict';

var CONTACTS_URL = 'http://moz.fruux.net';

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
  fruuxCallback: undefined,

  init: function() {
    var self = this;

    navigator.mozContacts.oncontactchange = function(event) {
      if (self.enabled) {
        self.enqueue(event.contactID);
        self.process();
      }
    };

    navigator.mozId.watch({
      wantIssuer: 'firefox-accounts',
      audience: CONTACTS_URL,
      loggedInUser: null,
      onready: function () {
        console.log('FxA is ready');
      },
      onerror: function () {
        console.log('FxA error :(');
      },
      onlogin: function (assertion) {
        console.log('got FxA assertion: ' + assertion);
        var xhr = new XMLHttpRequest({ mozSystem: true });
        xhr.onload = self.receiveFruuxCreds();
        xhr.open('POST', CONTACTS_URL + '/browserid/login', true);
        xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
        xhr.send(JSON.stringify({ assertion: assertion }));
      },
      onlogout: function () {
        console.log('User is logged out of FxA');
      }
    });
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

  customProvider: function (self, cb) {
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

  retryFruuxProvisioning: function () {
    var self = this;
    // TODO: put a limit of 5 attempts on fruux provisioning

    // Try fruux provisioning again
    console.log('Provisioning failed, will try again.');
    navigator.mozId.request();
  },

  receiveFruuxCreds: function () {
    var self = this;
    return function () {
      var creds;
      try {
        creds = JSON.parse(this.responseText);
      } catch (e) {
        self.retryFruuxProvisioning();
        return;
      }
      if (!creds.links || !creds.basicAuth) {
        self.retryFruuxProvisioning();
        return;
      }

      // TODO: discover the addressbook URL (see Discovery on http://sabre.io/dav/building-a-carddav-client/)
      var url = CONTACTS_URL + creds.links['addressbook-home-set'] + 'default';

      // TODO: save these transient credentials to localStorage to avoid
      // provisioning every time we need to push a contact
      self.fruuxCallback(url, creds.basicAuth.userName, creds.basicAuth.password);
    };
  },

  defaultProvider: function (self, cb) {
    console.log('Getting new fruux credentials...');
    self.fruuxCallback = cb;
    navigator.mozId.request();
  },

  upload: function(vcard) {
    var self = this;
    if (!self.enabled) {
      return;
    }

    var oReq = new XMLHttpRequest({ mozSystem: true });

    function reqListener() {
      console.log('contact pushed: ' + oReq.status + ' ' + oReq.statusText);
      if (oReq.status !== 204) { // TODO: support other 2xx status codes?
        // TODO: put a limit of 5 attempts on pushing a single contact
        self.upload(vcard);
      }
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

    providerFunction(self, function (url, username, password) {
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
