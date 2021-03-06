describe('User Middleware', function() {
  const baseDir = 'noflo-ui';
  let mw = null;
  before(function(done) {
    this.timeout(4000);
    mw = window.middleware('ui/UserMiddleware', baseDir);
    return mw.before(done);
  });
  beforeEach(() => mw.beforeEach());
  afterEach(() => mw.afterEach());

  describe('receiving a runtime:connect action', () =>
    it('should pass it out as-is', function(done) {
      const action = 'runtime:connect';
      const payload =
        {hello: 'world'};
      mw.receivePass(action, payload, done);
      return mw.send(action, payload);
    })
  );
  describe('receiving application:url action', function() {
    let originalUser = null;
    let originalToken = null;
    beforeEach(function() {
      originalUser = localStorage.getItem('flowhub-user');
      originalToken = localStorage.getItem('flowhub-token');
      if (originalUser) { localStorage.removeItem('flowhub-user'); }
      if (originalToken) { return localStorage.removeItem('flowhub-token'); }
    });
    afterEach(function() {
      if (originalUser) { localStorage.setItem('flowhub-user', originalUser); }
      if (originalToken) { return localStorage.setItem('flowhub-token', originalToken); }
    });
    describe('without logged in user', () =>
      it('should send out an empty user:info', function(done) {
        const action = 'application:url';
        const payload = 'https://app.flowhub.io';
        const check = data => chai.expect(data['flowhub-user']).to.be.a('null');
        mw.receiveAction('user:info', check, done);
        return mw.send(action, payload);
      })
    );
    describe('with logged in user', function() {
      const userData = {
        id: 1,
        name: 'Henri Bergius'
      };
      const newUserData = {
        id: 1,
        name: 'Henri Bergius',
        github: {
          scopes: ['repo']
        },
        plan: {
          type: 'backer'
        }
      };
      const userToken = 'oh3h8f89h28hyf98yf24g34g';
      let mock = null;
      beforeEach(function() {
        localStorage.setItem('flowhub-user', JSON.stringify(userData));
        localStorage.setItem('flowhub-token', userToken);
        return mock = sinon.fakeServer.create();
      });
      afterEach(() => mock.restore());
      it('should pass it out as-is and send user:info when token is valid', function(done) {
        const action = 'application:url';
        const payload = 'https://app.flowhub.io';
        const check = data => chai.expect(data['flowhub-user']).to.eql(userData);
        mw.receiveAction('user:info', check, done);
        mw.send(action, payload);
        mock.respondWith('GET', "https://api.flowhub.io/user", [
          200
          ,
          {'Content-Type': 'application/json'}
          , JSON.stringify(userData)
        ]);
        return (mock.respond)();
      });
      it('should pass it out as-is and send updated user:info when token is valid', function(done) {
        const action = 'application:url';
        const payload = 'https://app.flowhub.io';
        // We first send cached, then actual
        expected = [userData, newUserData];
        const check = function(data) {
          // Check payload sent to UI
          chai.expect(data['flowhub-user']).to.eql(expected.shift());
          if (!expected.length) {
            // Check data stored in cache
            const cached = JSON.parse(localStorage.getItem('flowhub-user'));
            chai.expect(cached).to.eql(newUserData);
          }
        };
        mw.receiveAction('user:info', check, () => {
          mw.receiveAction('user:info', check, done);
        });
        mw.send(action, payload);
        mock.respondWith('GET', "https://api.flowhub.io/user", [
          200
          ,
          {'Content-Type': 'application/json'}
          , JSON.stringify(newUserData)
        ]);
        return (mock.respond)();
      });
      it('should send user:logout when token is invalid', function(done) {
        const action = 'application:url';
        const payload = 'https://app.flowhub.io';
        const check = function(data) {};
        // We first send cached, then logout
        mw.receiveAction('user:info', (data) => {
          if (originalUser) {
            chai.expect(data['flowhub-user']).to.eql(JSON.parse(originalUser));
          } else {
            chai.expect(data['flowhub-user']).to.eql(null);
          }
        }, () => {
          mw.receiveAction('user:logout', check, done);
        });
        mw.send(action, payload);
        mock.respondWith('GET', "https://api.flowhub.io/user", [
          401
          ,
          {'Content-Type': 'application/json'}
          , JSON.stringify(userData)
        ]);
        (mock.respond)();
      });
    });
    describe('without user and with OAuth error in URL', () =>
      it('should send the error out', function(done) {
        const action = 'application:url';
        const payload = "https://app.flowhub.io?error=redirect_uri_mismatch&error_description=The+redirect_uri+MUST+match";
        const check = data => chai.expect(data.message).to.contain('The redirect_uri MUST match');
        mw.receiveAction('user:error', check, done);
        return mw.send(action, payload);
      })
    );
    describe('without user and with invalid grant code in URL', function() {
      let mock = null;
      let code = null;
      beforeEach(function() {
        code = 'dj0328hf3d9cq3c';
        return mock = sinon.fakeServer.create();
      });
      afterEach(() => mock.restore());
      it('should perform a token exchange and fail', function(done) {
        const action = 'application:url';
        const payload = `https://app.flowhub.io?code=${code}&state=`;
        const check = data => chai.expect(data.message).to.contain('bad_code_foo');
        mw.receiveAction('user:error', check, done);
        mw.send(action, payload);
        mock.respondWith('GET', `https://noflo-gate.herokuapp.com/authenticate/${code}`, [
          402
          ,
          {'Content-Type': 'application/json'}
          , JSON.stringify({
            error: 'bad_code_foo'})
        ]);
        return (mock.respond)();
      });
    });
    describe('without user and with grant code in URL yielding invalid API token', function() {
      let mock = null;
      let code = null;
      let token = null;
      beforeEach(function() {
        code = 'oivwehfh24890f84h';
        token = 'niov2o3wnnv4ioufuhh92348fh42q9';
        return mock = sinon.fakeServer.create();
      });
      afterEach(() => mock.restore());
      it('should perform a token exchange and fail at user fetch', function(done) {
        const action = 'application:url';
        const payload = `https://app.flowhub.io?code=${code}&state=`;
        const check = data => chai.expect(data.message).to.contain('Bad Credentials');
        mw.receiveAction('user:error', check, done);
        mw.send(action, payload);
        mock.respondWith('GET', `https://noflo-gate.herokuapp.com/authenticate/${code}`, req =>
          req.respond(200,
            {'Content-Type': 'application/json'}
            , JSON.stringify({
              token})
          )
        );
        mock.respondWith('GET', "https://api.flowhub.io/user", req =>
          req.respond(401,
            {'Content-Type': 'application/json'}
            , JSON.stringify({
              message: 'Bad Credentials'})
          )
        );
        (mock.respond)();
        return (mock.respond)();
      });
    });
    describe('without user and with valid grant code in URL', function() {
      let mock = null;
      let code = null;
      let token = null;
      let userData = null;
      beforeEach(function() {
        code = 'oivwehfh24890f84h';
        token = 'niov2o3wnnv4ioufuhh92348fh42q9';
        userData = {
          id: 1,
          name: 'Henri Bergius',
          github: {
            username: 'bergie',
            token
          },
          plan: {
            type: 'free'
          }
        };
        return mock = sinon.fakeServer.create();
      });
      afterEach(() => mock.restore());
      it('should perform a token exchange and update user information without state in URL', function(done) {
        const action = 'application:url';
        const payload = `https://app.flowhub.io?code=${code}`;
        const check = data => chai.expect(data['flowhub-user']).to.eql(userData);
        mw.receiveAction('user:info', check, done);
        mw.send(action, payload);
        mock.respondWith('GET', `https://noflo-gate.herokuapp.com/authenticate/${code}`, req =>
          req.respond(200,
            {'Content-Type': 'application/json'}
            , JSON.stringify({
              token})
          )
        );
        mock.respondWith('GET', "https://api.flowhub.io/user", req =>
          req.respond(200,
            {'Content-Type': 'application/json'}
            , JSON.stringify(userData))
        );
        (mock.respond)();
        return (mock.respond)();
      });
      it('should perform a token exchange and update user information with state in URL', function(done) {
        const action = 'application:url';
        const payload = `https://app.flowhub.io?code=${code}&state=`;
        const check = data => chai.expect(data['flowhub-user']).to.eql(userData);
        mw.receiveAction('user:info', check, done);
        mw.send(action, payload);
        mock.respondWith('GET', `https://noflo-gate.herokuapp.com/authenticate/${code}`, req =>
          req.respond(200,
            {'Content-Type': 'application/json'}
            , JSON.stringify({
              token})
          )
        );
        mock.respondWith('GET', "https://api.flowhub.io/user", req =>
          req.respond(200,
            {'Content-Type': 'application/json'}
            , JSON.stringify(userData))
        );
        (mock.respond)();
        return (mock.respond)();
      });
    });
  });
  describe('receiving user:login action', function() {
    describe('with app URL not matching redirect configuration', () =>
      it('should send user:error', function(done) {
        const action = 'user:login';
        const check = data => chai.expect(data.message).to.contain('http://localhost:9999');
        mw.receiveAction('user:error', check, done);
        return mw.send(action, {
          url: 'http://example.net',
          scopes: []
        });
      })
    );
    describe('with app URL matching redirect configuration', () =>
      it('should send application:redirect action with redirect URL', function(done) {
        const action = 'user:login';
        const check = data => chai.expect(data).to.contain('https://github.com/login/oauth/authorize');
        mw.receiveAction('application:redirect', check, done);
        return mw.send(action, {
          url: 'http://localhost:9999',
          scopes: []
        });
      })
    );
  });
  describe('receiving user:logout action', function() {
    let originalUser = null;
    const userData = {
      id: 1,
      name: 'Henri Bergius'
    };
    before(function() {
      originalUser = localStorage.getItem('flowhub-user');
      return localStorage.setItem('flowhub-user', JSON.stringify(userData));
    });
    after(function() {
      if (!originalUser) { return; }
      return localStorage.setItem('flowhub-user', originalUser);
    });
    it('should send empty object as user:info', function(done) {
      const action = 'user:logout';
      const check = data => chai.expect(data['flowhub-user']).to.be.a('null');
      mw.receiveAction('user:info', check, done);
      return mw.send(action, true);
    });
    it('should have cleared user data', function(done) {
      chai.expect(localStorage.getItem('flowhub-user')).to.equal(null);
      return done();
    });
  });
});
