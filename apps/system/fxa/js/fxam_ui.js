/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var FxaModuleUI = {
  maxSteps: null,
  init: function(flow) {
    // Add listeners to the main elements
    [
      'close', 'back', 'next', 'navigation', 'done'
    ].forEach(function(id) {
      this[Utils.camelCase(id)] = document.getElementById('fxa-module-' + id);
    }, this);

    this.close.addEventListener('click', function() {
      FxaModuleManager.close();
    });

    this.back.addEventListener('mousedown', function() {
      FxaModuleNavigation.back();
    });

    this.next.addEventListener('mousedown', function() {
      FxaModuleNavigation.next();
    });

    this.done.addEventListener('mousedown', function() {
      FxaModuleManager.done();
    });

    FxaModuleNavigation.init(flow);
  },
  setMaxSteps: function(num) {
    this.maxSteps = num;
  },
  loadStep: function(params) {
    var previousStep = document.getElementsByClassName('current')[0];
    var currentStep = params.step;
    // Lazy load current panel
    LazyLoader.load(currentStep, function() {
      // If the panel contains any new script elements,
      // lazy load those as well.
      var scripts = [].slice.call(currentStep.querySelectorAll('script'))
        .map(function(script) { return script.getAttribute('src'); });

      // Once all scripts are loaded, load the modules/UI
      LazyLoader.load(scripts, function() {
        if (params.count > 1 && params.count < FxaModuleUI.maxSteps) {
          FxaModuleUI.navigation.classList.remove('navigation-single-button');
          FxaModuleUI.navigation.classList.remove('navigation-back-only');

          if (currentStep.getAttribute('data-navigation') === 'back') {
            FxaModuleUI.navigation.classList.add('navigation-back-only');
          }
        } else {
          FxaModuleUI.navigation.classList.add('navigation-single-button');
          if (params.count === FxaModuleUI.maxSteps) {
            FxaModuleUI.navigation.classList.add('navigation-done');
          }
        }
        this.progress(100 * params.count / this.maxSteps);

        // the module was just lazy loaded. We can now get a reference to it.
        // TODO: Remove when modules initialize themselves
        if (params.step) {
          // TODO(Olav): Remove or make pretty if it stays ..
          var module = window[FxaModuleNavigation.moduleById(params.step.id)];
          if (module.init) {
            module.init(FxaModuleManager.paramsRetrieved);
          }
        }

        this._animate(previousStep, currentStep, params.back);
        params.callback && params.callback();
      }.bind(this));
    }.bind(this));
  },
  _animate: function(from, to, back) {
    if (!to)
      return;

    if (!from) {
      to.classList.add('current');
      return;
    }

    if (this._inTransition(from) || this._inTransition(to))
      return;

    from.addEventListener('animationend', function fromAnimEnd() {
      from.removeEventListener('animationend', fromAnimEnd, false);
      from.classList.remove(back ? 'currentToRight' : 'currentToLeft');
      from.classList.remove('current');
      from.classList.remove('back');
    }, false);

    to.addEventListener('animationend', function toAnimEnd() {
      to.removeEventListener('animationend', toAnimEnd, false);
      to.classList.remove(back ? 'leftToCurrent' : 'rightToCurrent');
      to.classList.add('current');
    }, false);

    from.classList.add(back ? 'currentToRight' : 'currentToLeft');
    to.classList.add(back ? 'leftToCurrent' : 'rightToCurrent');
  },
  _inTransition: function(elem) {
    return elem.classList.contains('currentToRight') ||
    elem.classList.contains('currentToLeft') ||
    elem.classList.contains('rightToCurrent') ||
    elem.classList.contains('leftToCurrent') || false;
  },
  progress: function(value) {
    document.querySelector('#fxa-progress').value = value;
  },
  setNextText: function(l10n) {
    this.next.textContent = l10n;
  },
  disableNextButton: function() {
    this.next.setAttribute('disabled', 'disabled');
  },
  enableNextButton: function() {
    this.next.removeAttribute('disabled');
  }
};
