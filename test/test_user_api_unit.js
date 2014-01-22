// == BSD2 LICENSE ==
// Copyright (c) 2014, Tidepool Project
// 
// This program is free software; you can redistribute it and/or modify it under
// the terms of the associated License, which is identical to the BSD 2-Clause
// License as published by the Open Source Initiative at opensource.org.
// 
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
// FOR A PARTICULAR PURPOSE. See the License for more details.
// 
// You should have received a copy of the License along with this program; if
// not, you can obtain one from Tidepool Project at tidepool.org.
// == BSD2 LICENSE ==

'use strict';

var _ = require('lodash');
var expect = require('chai').expect;

// in the test module, because require returns the same result for the same request,
// we can override bits of the environment for the userapi
var env = {
  mongoConnectionString: 'mongodb://localhost/test_user_api',
  // the special config value we pass for testing will enable us to wipe the database
  _wipeTheEntireDatabase: true,
  adminKey: 'specialkey',
  saltDeploy: 'randomsaltvalue',
  secret: 'a secret of some sort',
  serverSecret: 'sharedMachineSecret',
  logger: { error: console.log, warn: console.log, info: console.log },
};

var dbmongo = require('../lib/db_mongo.js')(env);
var userapi = require('../lib/userapi.js')(env, dbmongo);

var restify = require('restify');
var server = restify.createServer({ name: "testUserApi" });
server.use(restify.queryParser());
server.use(restify.bodyParser());
userapi.attachToServer(server);
server.listen(10000);

var supertest = require('supertest')(server);

describe('userapi', function(){

  describe('basics', function() {
    it('should have user test', function() {
      var isTrue = true;
      expect(isTrue).to.exist;
    });
    it('should have an app', function() {
      expect(userapi).to.exist;
    });
    it('should have server object', function() {
      expect(userapi).to.respondTo('attachToServer');
    });
  });

  describe('GET /status', function() {

    it('should respond with 200', function(done) {
      supertest
        .get('/status')
        .expect(200)
        .end(function(err, obj) {
               if (err) return done(err);
               expect(err).to.not.exist;
               // console.log(obj);
               expect(obj.res.body.down).to.eql([]);
               expect(obj.res.body.up).to.eql(['mongo']);
               done();
             });
    });

    it('should respond with 403 if you set status to 403', function(done) {
      supertest
        .get('/status?status=403')
        .expect(403)
        .end(function(err, obj) {
               if (err) return done(err);
               done();
             });
    });

    it('should ignore extra query parameters', function(done) {
      supertest
        .get('/status?bogus=whatever')
        .expect(200)
        .end(function(err, obj) {
               if (err) return done(err);
               done();
             });
    });

  });

  describe('GET /nonexistent', function() {

    it('should respond with 404', function(done) {
      supertest
        .get('/nonexistent')
        .expect(404)
        .end(function(err, obj) {
               if (err) return done(err);
               done();
             });
    });

  });

  describe('POST /status', function() {

    it('should respond with 405', function(done) {
      supertest
        .post('/status')
        .expect(405)
        .end(function(err, obj) {
               if (err) return done(err);
               done();
             });
    });

  });

  describe('POST /user with a garbage payload', function() {

    it('should respond with 400', function(done) {
      supertest
        .post('/user')
        .send('junk')
        .expect(400)
        .end(function(err, obj) {
               if (err) return done(err);
               done();
             });
    });

  });

  describe('POST /login with an invalid userid/pw', function() {

    it('should respond with 401', function(done) {
      supertest
        .post('/login')
        .set('X-Tidepool-UserID', 'badid')
        .set('X-Tidepool-Password', 'abcdef1234567890')
        .expect(401)
        .end(function(err, res) {
               if (err) return done(err);
               expect(res.body).to.equal('login failed');
               done();
             });
    });

  });

  describe('Create and manage a user', function() {
    var user = {
      username: 'realname',
      emails: ['foo@bar.com'],
      password: 'R6LvLQ$=aTBgfj&4jqAq'
    };

    var sessionToken = null;
    var oldToken = null;

    describe('POST /user with a complete payload to create a new user and log in', function() {

      it('should respond with 201', function(done) {
        supertest
          .post('/user')
          .send(user)
          .expect(201)
          .end(function(err, obj) {
                 if (err) return done(err);
                 expect(obj.res.body.username).to.equal(user.username);
                 expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
                 expect(obj.res.body.userid).to.exist;
                 expect(obj.res.body.userid).to.match(/[a-f0-9]{10}/);
                 user.userid = obj.res.body.userid;
                 expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
                 sessionToken = obj.res.headers['x-tidepool-session-token'];
                 done();
               });
      });
    });

    describe('POST /logout with valid session token #1', function() {

      it('should respond with 200 and log out', function(done) {
        supertest
          .post('/logout')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(function(err, res) {
                 if (err) return done(err);
                 done();
               });
      });

    });


    describe('POST /login for that user with a slightly bad password', function() {
      it('should respond with 401', function(done) {
        supertest
          .post('/login')
          .set('X-Tidepool-UserID', user.username)
          .set('X-Tidepool-Password', user.password + 'x')
          .expect(401)
          .end(function(err, obj) {
                 if (err) return done(err);
                 // console.log('a');
                 // console.log('BODY: ', obj.res.body);
                 // expect(obj.headers['x-tidepool-session-token']).to.not.exist;
                 // expect(obj.res.body).to.equal('login failed');
                 done();
               });
      });
    });

    describe('POST /login with good PW to log in to that user', function() {

      it('should respond with 200 and a session token', function(done) {
        supertest
          .post('/login')
          .set('X-Tidepool-UserID', user.username)
          .set('X-Tidepool-Password', user.password)
          .expect(200)
          .end(function(err, obj) {
                 if (err) return done(err);
                 expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
                 sessionToken = obj.res.headers['x-tidepool-session-token'];
                 done();
               });
      });
    });

    describe('GET /user while logged in', function() {

      it('should respond with 200 and user info', function(done) {
        supertest
          .get('/user')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(function(err, obj) {
                 if (err) return done(err);
                 // console.log(obj.res.body);
                 expect(obj.res.body.username).to.exist;
                 expect(obj.res.body.username).to.equal(user.username);
                 expect(obj.res.body.emails).to.exist;
                 expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
                 expect(obj.res.body.userid).to.exist;
                 expect(obj.res.body.userid).to.equal(user.userid);
                 done();
               });
      });
    });

    describe('GET /login for logged in user', function() {

      it('should return 200 with a new token and the user ID', function(done) {
        supertest
          .get('/login')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(function(err, obj) {
                 if (err) return done(err);
                 // console.log(obj.res.status);
                 // console.log(obj.res.body);
                 expect(obj.res.body.userid).to.equal(user.userid);
                 expect(obj.res.headers['x-tidepool-session-token']).to.exist;
                 expect(obj.res.headers['x-tidepool-session-token']).to.not.equal(sessionToken);
                 oldToken = sessionToken;
                 sessionToken = obj.res.headers['x-tidepool-session-token'];
                 done();
               });
      });

    });

    describe('GET /login with old token', function() {

      it('should return 401', function(done) {
        supertest
          .get('/login')
          .set('X-Tidepool-Session-Token', oldToken)
          .expect(401)
          .end(function(err, obj) {
                 if (err) return done(err);
                 done();
               });
      });
    });


    describe('POST /logout without a sessionToken', function() {

      it('should respond with 401', function(done) {
        supertest
          .post('/logout')
          .expect(401)
          .end(function(err, res) {
                 if (err) return done(err);
                 done();
               });
      });

    });

    describe('POST /logout with valid session token #2', function() {

      it('should respond with 200', function(done) {
        supertest
          .post('/logout')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(function(err, res) {
                 if (err) return done(err);
                 done();
               });
      });

    });

    describe('GET /user with a valid id but not logged in', function() {

      it('should respond with 401', function(done) {
        supertest
          .get('/user/' + user.userid)
          .expect(401)
          .end(function(err, res) {
                 if (err) return done(err);
                 done();
               });
      });

    });

    describe('GET /user without token', function() {

      it('should respond with 401 and no user info', function(done) {
        supertest
          .get('/user')
          .expect(401)
          .end(function(err, obj) {
                 if (err) return done(err);
                 expect(obj.res.body).to.equal('Unauthorized');
                 done();
               });
      });
    });


  });


describe('Create and manage a user as a machine', function() {
    var user = {
        username: 'anotheruser',
        emails: ['buzz@bazz.com'],
        password: 'R6asd$=aTBgfj&7jqZ7'
    };

    var sessionToken = null;
    var serverToken = null;

    describe('POST /user with a complete payload to create a new user and log in', function() {

        it('should respond with 201', function(done) {
            supertest
            .post('/user')
            .send(user)
            .expect(201)
            .end(function(err, obj) {
                if (err) return done(err);
                expect(obj.res.body.username).to.equal(user.username);
                expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
                expect(obj.res.body.userid).to.exist;
                expect(obj.res.body.userid).to.match(/[a-f0-9]{10}/);
                user.userid = obj.res.body.userid;
                expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
                sessionToken = obj.res.headers['x-tidepool-session-token'];
                done();
            });
        });
    });

    describe('POST /serverlogin with good secret', function() {

        it('should respond with 200 and a session token', function(done) {
            supertest
            .post('/serverlogin')
            .set('X-Tidepool-Server-Name', 'Test Server')
            .set('X-Tidepool-Server-Secret', env.serverSecret)
            .expect(200)
            .end(function(err, obj) {
                if (err) return done(err);
                expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
                serverToken = obj.res.headers['x-tidepool-session-token'];
                expect(serverToken).to.not.equal(sessionToken);
                done();
            });
        });
    });

    describe('GET /user/:id while logged in', function() {

        it('should respond with 200 and user info', function(done) {
            supertest
            .get('/user/' + user.userid)
            .set('X-Tidepool-Session-Token', serverToken)
            .expect(200)
            .end(function(err, obj) {
                if (err) return done(err);
                // console.log(obj.res.body);
                expect(obj.res.body.username).to.exist;
                expect(obj.res.body.username).to.equal(user.username);
                expect(obj.res.body.emails).to.exist;
                expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
                expect(obj.res.body.userid).to.exist;
                expect(obj.res.body.userid).to.equal(user.userid);
                done();
            });
        });
    });

    describe('GET /token/:token without a valid serverToken', function() {
        it('should respond with 401', function(done) {
            supertest
            .get('/token/' + sessionToken)
            .set('X-Tidepool-Session-Token', sessionToken)
            .expect(401)
            .end(function(err, obj) {
                 if (err) return done(err);
                 expect(obj.res.body).to.equal('Unauthorized');
                 done();
               });
        });
    });

    describe('GET /token/:token with valid serverToken', function() {
        it('should respond with 200 and user info', function(done) {
            supertest
            .get('/token/' + sessionToken)
            .set('X-Tidepool-Session-Token', serverToken)
            .expect(200)
            .end(function(err, obj) {
                if (err) return done(err);
                // console.log(obj.res.body);
                expect(obj.res.body.userid).to.exist;
                expect(obj.res.body.userid).to.exist;
                expect(obj.res.body.userid).to.equal(user.userid);
                done();
            });
        });
    });

    describe('GET /login to refresh machine user', function() {

        it('should return 200 with a new token and the user ID', function(done) {
            supertest
            .get('/login')
            .set('X-Tidepool-Session-Token', serverToken)
            .expect(200)
            .end(function(err, obj) {
                if (err) return done(err);
                // console.log(obj.res.status);
                // console.log(obj.res.body);
                expect(obj.res.body.userid).to.equal('Test Server');
                expect(obj.res.headers['x-tidepool-session-token']).to.exist;
                expect(obj.res.headers['x-tidepool-session-token']).to.not.equal(serverToken);
                serverToken = obj.res.headers['x-tidepool-session-token'];
                done();
            });
         });

    });

    describe('POST /logout with valid session token', function() {

        it('should respond with 200 and log out', function(done) {
            supertest
            .post('/logout')
            .set('X-Tidepool-Session-Token', sessionToken)
            .expect(200)
            .end(function(err, res) {
                if (err) return done(err);
                done();
            });
        });

    });

    describe('POST /logout with valid server token', function() {

        it('should respond with 200', function(done) {
            supertest
            .post('/logout')
            .set('X-Tidepool-Session-Token', serverToken)
            .expect(200)
            .end(function(err, res) {
                if (err) return done(err);
                done();
            });
        });

    });

});


  describe('GET /login', function() {

    it('should respond with 404', function() {
      supertest
        .get('/login')
        .expect(404);
    });

  });

  describe('POST /user without any data', function() {

    it('should respond with 400', function() {
      supertest
        .post('/status')
        .expect(400);
    });

  });

  describe('GET /login', function() {

    it('should respond with 404', function() {
      supertest
        .get('/login')
        .expect(404);
    });

  });
});

