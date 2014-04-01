/* Listener for contacts changes */

/* exported BackupService */
/* global navigator, FxAccountsClient */

var BackupService;

(function() {

'use strict';

BackupService = {
  enabled: true,    // we'll set this with a pref later
  queue: [],
  initialized: false,
  fruuxCallback: undefined,
  provisioningAttempts: 0,
  BACKUP_PROVIDERS: 'identity.services.contacts.providers',
  MAX_PROVISIONING_ATTEMPTS: 5,

  init: function() {
    navigator.mozContacts.oncontactchange = function(event) {
      if (this.enabled) {
        this.enqueue(event.contactID);
        this.process();
      }
    }.bind(this);
  },

  getCurrentProvider: function(accountId) {
    var self = this;
    return new Promise(function done(resolve, reject) {
      ContactsBackupStorage.getProviderProfile(accountId).then(
        function (providerData) {
          if (providerData) {
            resolve(providerData);
            return;
          }
          var req = navigator.mozSettings.createLock()
                    .get(self.BACKUP_PROVIDERS);
          req.onsuccess = function() {
            resolve(req.result[self.BACKUP_PROVIDERS].default);
          };
        },
        function(error) {
          dump("** aw, snap: " + error.toString() + "\n");
          reject(error);
        }
      );
    });
  },

  // Find a single contact by id - returns promise
  findContactById: function (contactID) {
    var options = {
      filterBy: ['id'],
      filterOp: 'equals',
      filterValue: contactID
    };

    return new Promise(function done(resolve, reject) {
      var request = navigator.mozContacts.find(options);

      request.onsuccess = function(event) {
        var result = event.target.result;
        if (!result.length) {
          return resolve(null);
        }
        return resolve(result[0]);
      };

      request.onerror = function(error) {
        return reject(error);
      };
    });
  },

  // Provision an identity from a provider
  provision: function() {
    var self = this;
    return new Promise(function done(resolve, reject) {

      FxAccountsClient.getAccounts(function(account) {
        var fxa_id = account.accountId;
        if (account && account.verified) {
          self.getCurrentProvider(account.accountId).then(function(provider) {
            FxAccountsClient.getAssertion(provider.url, {},
              function onsuccess(assertion) {
                var xhr = new XMLHttpRequest({ mozSystem: true });

                xhr.onload = function(responseText) {
                  self.receiveProvisionedCreds(responseText, provider).then(
                    function(creds) {
                      // Must have fxa_id on creds for storage
                      creds.fxa_id = account.accountId;
                      ContactsBackupStorage.updateProviderProfile(fxa_id, creds).then(
                        function() { 
                          resolve(creds); 
                        },
                        reject
                      );
                    },
                    reject
                  );
                };
                xhr.open('POST', provider.url + '/browserid/login', true);
                xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
                xhr.send(JSON.stringify({ assertion: assertion }));
              },
              function onerror(error) {
                reject(error);
              }
            );
          }, reject);
        }
      });
    });
  },

  // return promise
  receiveProvisionedCreds: function (responseText, provider) {
    return new Promise(function done(resolve, reject) {
      var response;
      try {
        response = JSON.parse(responseText);
      } catch(error) {
        return reject(error);
      }

      if (!response.links || !response.basicAuth) {
        return reject(new Error("Response did not include links and basicAuth creds"));
      }

      // TODO: discover the addressbook URL 
      // (see Discovery on http://sabre.io/dav/building-a-carddav-client/)
      var url = provider.url + response.links['addressbook-home-set'] + 'default';

      resolve({
        url: url,
        username: response.basicAuth.userName,
        password: response.basicAuth.password
      });
    }.bind(this));
  },

  enqueue: function(contactID) {
    if (this.queue.indexOf(contactID)) {
      this.queue = this.queue.splice(this.queue.indexOf(contactID), 1);
    }
    this.queue.push(contactID);
  },

  process: function(delay) {
    delay = delay || 0;

    setTimeout(function later() {
      this.backup();
    }.bind(this), delay);
  },

  getCredentials: function() {
    var self = this;
    return new Promise(function done(resolve, reject) {
      FxAccountsClient.getAccounts(function(account) {
        if (account && account.verified) {
          ContactsBackupStorage.getProviderProfile(account.accountId).then(
            function loaded(creds) {
              if ((!creds.url || !creds.username || !creds.password) && creds.canProvision) {
                return self.provision().then(resolve, reject);
              }
              return resolve(creds);
            },
            reject
          );
        } else {
          return reject(new Error("No user with verified account signed in"));
        }
      });
    });
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
    if (self.provisioningAttempts === self.MAX_PROVISIONING_ATTEMPTS) {
      console.error("** provisioning failed. giving up.");
      return;
    }
    self.provisioningAttempts += 1;
    // Try fruux provisioning again
    console.log('Provisioning failed, will try again in 1 second.');
    setTimeout(function() {
      self.provision();
    }, 1000);
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

    this.getCredentials().then(
      function success(creds) {
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
      function rejected(error) {
        console.error("** awwww ... " + error.toString());
      }
    );
  },

  backup: function() {
    return;

    /*
    var contactID = this.queue.shift();
    dump("FF backup this one: " + contactID + "\n");
    var self = this;
    if (!contactID) {
      return;
    }

    this.findContactById(contactID).then(
      function resolve(result) {
        try {
          var vcard = new MozContactTranslator(result).toString();
          console.log("** got something: " + vcard);
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
    */
  },
};

BackupService.init();

}());
