/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/**
 * Check fxa_manager.js for a further explanation about Firefox Accounts and
 * its architecture in Firefox OS.
 */

'use strict';

var FxAccountsClient = function FxAccountsClient() {

  var eventCount = 0;

  var callbacks = {};

  var sendMessage = function sendMessage(message, successCb, errorCb) {
    if (!eventCount) {
      window.addEventListener('mozFxAccountsChromeEvent', onChromeEvent);
    }

    var id = getUUID();
    callbacks[id] = {
      successCb: successCb,
      errorCb: errorCb
    };

    var details = {
      id: id,
      data: message
    };

    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('mozFxAccountsContentEvent', true, true, details);
    window.dispatchEvent(event);

    eventCount++;
  };

  var onChromeEvent = function onChromeEvent(event) {
    var message = event.detail;

    if (!message.id) {
      console.log('Got mozFxAccountsChromeEvent with no id');
      return;
    }

    var callback = callbacks[message.id];
    if (message.data &&
        callback.successCb && callback.successCb instanceof Function) {
      callback.successCb(message.data);
      delete callbacks[message.id];
    } else if (message.error &&
               callback.errorCb && callback.errorCb instanceof Function) {
      callback.errorCb(message.error);
      delete callbacks[message.id];
    }

    eventCount--;
    if (!eventCount) {
      window.removeEventListener('mozFxAccountsChromeEvent', onChromeEvent);
    }
  };

  var getUUID = function getUUID() {
    var s4 = function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
                 .toString(16)
                 .substring(1);
    };

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4();
  };


  // === API ===

  var changePassword = function changePassword(accountId, oldPass, newPass,
                                               successCb, errorCb) {
    sendMessage({
      method: 'changePassword',
      accountId: accountId,
      oldPass: oldPass,
      newPass: newPass
    }, successCb, errorCb);
  };

  var deleteAccount = function deleteAccount(accountId, password, successCb,
                                             errorCb) {
    sendMessage({
      method: 'delete',
      accountId: accountId,
      password: password
    }, successCb, errorCb);
  };

  var getAccounts = function getAccounts(successCb, errorCb) {
    sendMessage({
      method: 'getAccounts'
    }, successCb, errorCb);
  };

  var logout = function logout(accountId, password, successCb, errorCb) {
    sendMessage({
      method: 'logout',
      accountId: accountId,
      password: password
    }, successCb, errorCb);
  };

  var queryAccount = function queryAccount(accountId, successCb, errorCb) {
    sendMessage({
      method: 'queryAccount',
      accountId: accountId
    }, successCb, errorCb);
  };

  var signIn = function signIn(accountId, password, successCb, errorCb) {
    sendMessage({
      method: 'signIn',
      accountId: accountId,
      password: password
    }, successCb, errorCb);
  };

  var signUp = function signUp(accountId, password, successCb, errorCb) {
    sendMessage({
      method: 'signUp',
      accountId: accountId,
      password: password
    }, successCb, errorCb);
  };

  var verificationStatus = function verificationStatus(accountId, successCb,
                                                       errorCb) {
    sendMessage({
      method: 'verificationStatus',
      accountId: accountId
    }, successCb, errorCb);
  };

  return {
    'changePassword': changePassword,
    'deleteAccount': deleteAccount,
    'getAccounts': getAccounts,
    'logout': logout,
    'queryAccount': queryAccount,
    'signIn': signIn,
    'signUp': signUp,
    'verificationStatus': verificationStatus
  };

}();
