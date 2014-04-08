/* Listener for contacts changes */

/* exported BackupService */
/* global navigator, FxAccountsClient */

var BackupService;

(function() {

'use strict';

BackupService = {
  enabled: true,    // TODO: set this with a pref
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
    console.log('Provisioning account...');
    return new Promise(function done(resolve, reject) {

      FxAccountsClient.getAccounts(function(account) {
        var fxa_id = account.accountId;
        if (account && account.verified) {
          self.getCurrentProvider(account.accountId).then(function(provider) {
            FxAccountsClient.getAssertion(provider.url, {},
              function onsuccess(assertion) {
                console.log('Got FxA assertion: ' + assertion);
                var xhr = new XMLHttpRequest({ mozSystem: true });

                xhr.onload = function() {
                  switch (xhr.status) {
                    case 200:
                      var responseText = this.responseText;
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
                      break;
                    default:
                      // TODO: need to retry provisioning
                      // TODO: only attempt provisioning 5 times
                      console.error("Non-200 response from provider: " + xhr.status);
                      break;
                  }
                };

                xhr.onerror = function(error) {
                  console.error('!! xhr error: ' + error.toString());
                };

                xhr.open('POST', provider.url + '/browserid/login', true);
                xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
                xhr.send(JSON.stringify({ assertion: assertion }));
              },
              reject
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
        console.error("provisioned creds: " + error.toString());
        return reject(error);
      }

      if (!response.links || !response.basicAuth) {
        return reject(new Error("Response did not include links and basicAuth creds"));
      }

      // TODO: discover the addressbook URL 
      // (see Discovery on http://sabre.io/dav/building-a-carddav-client/)
      var url = provider.url + response.links['addressbook-home-set'] + 'default';
      console.log('Got fruux creds: ' + response.basicAuth.userName + ':' + response.basicAuth.password);

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
      // TODO: skip Firefox Accounts stuff when using custom CardDAV server
      FxAccountsClient.getAccounts(function(account) {
        if (account && account.verified) {
          ContactsBackupStorage.getProviderProfile(account.accountId).then(
            function loaded(creds) {
              console.log('Got creds: ' + JSON.stringify(creds));
              if ((!creds.url || !creds.username || !creds.password) && creds.canProvision) {
                return self.provision().then(resolve, reject);
              } else {
                console.log('No need to provision an account.');
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

  upload: function(contactId, vcard) {
    var self = this;
    if (!self.enabled) {
      return;
    }

    this.getCredentials().then(
      function success(creds) {
        if (!creds.username || !creds.password || !creds.url) {
          dump("** no creds!\n");
          return;
        }
        var oReq = new XMLHttpRequest({ mozSystem: true });

        function reqListener() {
          console.log('contact pushed: ' + oReq.status + ' ' + oReq.statusText);
          if (oReq.status !== 204) { // TODO: support other 2xx status codes?
            console.log("Contact upload failed, will retry.");
            self.upload(contactId, vcard);
            // TODO: put a limit of 5 attempts on pushing a single contact
          }
        }
        oReq.onload = reqListener;

        var fullURL = creds.url + '/' + contactId + '.vcf';
        oReq.open('PUT', fullURL, true, creds.username, creds.password);
        oReq.setRequestHeader('Content-Type', 'text/vcard; charset=utf-8');
        oReq.send(vcard);
      },
      function rejected(error) {
        console.error("** awwww ... " + error.toString());
      }
    );
  },

  backup: function() {
    var contactID = this.queue.shift();

    var self = this;
    if (!contactID) {
      return;
    }

    this.findContactById(contactID).then(
      function resolve(result) {
        try {
          var vcard = new MozContactTranslator(result).toString();
          console.log("** ok upload this: " + vcard);
          self.upload(result.id, vcard);
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
