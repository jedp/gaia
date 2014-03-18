/* Listener for contacts changes */

(function() {

'use strict';

var BackupService = {
  enabled: false,
  queue: [],

  init: function() {
    console.log('** backup service init');
    console.log(' mozContacts is ' + typeof mozContacts);

    mozContacts.oncontactchange = function(event) {
      console.log('contact change');
      if (this.enabled) {
        this.enqueue(event.contactID);
      }
    }.bind(this);
  },

  enqueue: function(contactID) {
    console.log('** here we would enqueue ' + contactID);
  },

};

BackupService.init();

}());
