const fs = require('fs');
const path = require('path');

function req(name, method, url, opts = {}) {
  const item = {
    name,
    request: {
      method,
      header: opts.header || [],
      url: `{{baseUrl}}${url}`,
    },
    event: [
      {
        listen: 'test',
        script: { type: 'text/javascript', exec: opts.test.split('\n') },
      },
    ],
  };
  if (opts.body) {
    item.request.body = { mode: 'raw', raw: opts.body, options: { raw: { language: 'json' } } };
    item.request.header = [{ key: 'Content-Type', value: 'application/json' }, ...(opts.header || [])];
  }
  return item;
}

function authAna() {
  return [{ key: 'Authorization', value: 'Bearer {{anaToken}}' }];
}

function authLuis() {
  return [{ key: 'Authorization', value: 'Bearer {{luisToken}}' }];
}

const errorSchema = `
const body = pm.response.json();
pm.test('esquema Error (error y code string)', function () {
  pm.expect(body).to.have.property('error').that.is.a('string');
  pm.expect(body).to.have.property('code').that.is.a('string');
});
`;

const collection = {
  info: {
    name: 'S11 Cafetería API',
    description: 'Casos alineados a docs/matriz.md. Newman 6 / Collection v2.1.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'anaToken', value: '' },
    { key: 'luisToken', value: '' },
    { key: 'orderId', value: '' },
  ],
  item: [
    req('[SETUP-01] Reiniciar datos', 'POST', '/api/test/reset', {
      test: `
pm.test('SETUP-01 reset 200', function () {
  pm.response.to.have.status(200);
  const body = pm.response.json();
  pm.expect(body.ok).to.eql(true);
  pm.expect(body.orders).to.eql(0);
});
`,
    }),
    req('[AUTH-01] Login válido de Ana', 'POST', '/api/auth/login', {
      body: JSON.stringify({ email: 'ana@cafeteria.test', password: 'demo-ana' }, null, 2),
      test: `
const body = pm.response.json();
pm.test('AUTH-01 status 200', function () { pm.response.to.have.status(200); });
pm.test('AUTH-01 token y usuaria', function () {
  pm.expect(body.token).to.be.a('string').and.not.empty;
  pm.expect(body.user.email).to.eql('ana@cafeteria.test');
  pm.expect(body.user.id).to.eql(1);
});
pm.collectionVariables.set('anaToken', body.token);
`,
    }),
    req('[AUTH-02] Credenciales inválidas', 'POST', '/api/auth/login', {
      body: JSON.stringify({ email: 'ana@cafeteria.test', password: 'nope' }, null, 2),
      test: `
pm.test('AUTH-02 status 401', function () { pm.response.to.have.status(401); });
pm.test('AUTH-02 code INVALID_CREDENTIALS', function () {
  pm.expect(pm.response.json().code).to.eql('INVALID_CREDENTIALS');
});
${errorSchema}
`,
    }),
    req('[AUTH-03] Sin credenciales', 'GET', '/api/orders/1', {
      test: `
pm.test('AUTH-03 status 401', function () { pm.response.to.have.status(401); });
pm.test('AUTH-03 code MISSING_TOKEN', function () {
  pm.expect(pm.response.json().code).to.eql('MISSING_TOKEN');
});
${errorSchema}
`,
    }),
    req('[AUTH-04] Token inválido', 'GET', '/api/orders/1', {
      header: [{ key: 'Authorization', value: 'Bearer token-falso' }],
      test: `
pm.test('AUTH-04 status 401', function () { pm.response.to.have.status(401); });
pm.test('AUTH-04 code INVALID_TOKEN', function () {
  pm.expect(pm.response.json().code).to.eql('INVALID_TOKEN');
});
${errorSchema}
`,
    }),
    req('[ORD-01] Crear pedido válido', 'POST', '/api/orders', {
      header: authAna(),
      body: JSON.stringify({ items: [{ productId: 1, quantity: 1 }] }, null, 2),
      test: `
const body = pm.response.json();
pm.test('ORD-01 status 201', function () { pm.response.to.have.status(201); });
pm.test('ORD-01 negocio confirmado', function () {
  pm.expect(body.status).to.eql('confirmed');
  pm.expect(body.totalCents).to.eql(3500);
  pm.expect(body.totalCents).to.be.a('number');
  pm.expect(body.items[0].productId).to.eql(1);
});
pm.collectionVariables.set('orderId', String(body.id));
`,
    }),
    req('[ORD-02] Verificar pedido y stock', 'GET', '/api/orders/{{orderId}}', {
      header: authAna(),
      test: `
const order = pm.response.json();
pm.test('ORD-02 status 200', function () { pm.response.to.have.status(200); });
pm.test('ORD-02 persistió el create', function () {
  pm.expect(String(order.id)).to.eql(pm.collectionVariables.get('orderId'));
  pm.expect(order.totalCents).to.eql(3500);
  pm.expect(order.status).to.eql('confirmed');
});
pm.sendRequest({
  url: pm.environment.get('baseUrl') + '/api/products/1',
  method: 'GET',
}, function (err, res) {
  pm.test('ORD-02 stock Americano bajó a 19', function () {
    pm.expect(err).to.eql(null);
    pm.expect(res.json().stock).to.eql(19);
  });
});
`,
    }),
    req('[ORD-03] Pedido vacío', 'POST', '/api/orders', {
      header: authAna(),
      body: JSON.stringify({ items: [] }, null, 2),
      test: `
pm.test('ORD-03 status 400', function () { pm.response.to.have.status(400); });
pm.test('ORD-03 code EMPTY_ORDER', function () {
  pm.expect(pm.response.json().code).to.eql('EMPTY_ORDER');
});
${errorSchema}
`,
    }),
    req('[ORD-04] Falta items', 'POST', '/api/orders', {
      header: authAna(),
      body: '{}',
      test: `
pm.test('ORD-04 status 400', function () { pm.response.to.have.status(400); });
pm.test('ORD-04 code EMPTY_ORDER', function () {
  pm.expect(pm.response.json().code).to.eql('EMPTY_ORDER');
});
${errorSchema}
`,
    }),
    req('[ORD-05] Pedido inexistente', 'GET', '/api/orders/99999', {
      header: authAna(),
      test: `
pm.test('ORD-05 status 404', function () { pm.response.to.have.status(404); });
pm.test('ORD-05 code ORDER_NOT_FOUND', function () {
  pm.expect(pm.response.json().code).to.eql('ORDER_NOT_FOUND');
});
${errorSchema}
`,
    }),
    req('[AUTH-05] Login de Luis', 'POST', '/api/auth/login', {
      body: JSON.stringify({ email: 'luis@cafeteria.test', password: 'demo-luis' }, null, 2),
      test: `
const body = pm.response.json();
pm.test('AUTH-05 Luis 200', function () { pm.response.to.have.status(200); });
pm.collectionVariables.set('luisToken', body.token);
`,
    }),
    req('[ORD-06] Recurso ajeno', 'GET', '/api/orders/{{orderId}}', {
      header: authLuis(),
      test: `
pm.test('ORD-06 status 403', function () { pm.response.to.have.status(403); });
pm.test('ORD-06 code FORBIDDEN', function () {
  pm.expect(pm.response.json().code).to.eql('FORBIDDEN');
});
${errorSchema}
`,
    }),
    req('[PAG-01] Productos página 1', 'GET', '/api/products?page=1&pageSize=2', {
      test: `
const body = pm.response.json();
pm.test('PAG-01 status 200', function () { pm.response.to.have.status(200); });
pm.test('PAG-01 corte de página', function () {
  pm.expect(body.items).to.have.length(2);
  pm.expect(body.items[0].id).to.eql(1);
  pm.expect(body.items[1].id).to.eql(2);
  pm.expect(body.total).to.eql(4);
  pm.expect(body.totalPages).to.eql(2);
  pm.expect(body.page).to.eql(1);
});
`,
    }),
    req('[PAG-02] Productos página 2', 'GET', '/api/products?page=2&pageSize=2', {
      test: `
const body = pm.response.json();
pm.test('PAG-02 status 200', function () { pm.response.to.have.status(200); });
pm.test('PAG-02 no repite la página 1', function () {
  pm.expect(body.items.map(i => i.id)).to.eql([3, 4]);
  pm.expect(body.items.some(i => i.id === 1)).to.eql(false);
});
`,
    }),
    req('[CAN-01] Cancelar pedido', 'PUT', '/api/orders/{{orderId}}/cancel', {
      header: authAna(),
      test: `
const body = pm.response.json();
pm.test('CAN-01 status 200', function () { pm.response.to.have.status(200); });
pm.test('CAN-01 primera cancelación', function () {
  pm.expect(body.repeated).to.eql(false);
  pm.expect(body.order.status).to.eql('cancelled');
});
pm.sendRequest({
  url: pm.environment.get('baseUrl') + '/api/products/1',
  method: 'GET',
}, function (err, res) {
  pm.test('CAN-01 stock volvió a 20', function () {
    pm.expect(err).to.eql(null);
    pm.expect(res.json().stock).to.eql(20);
  });
});
`,
    }),
    req('[CAN-02] Repetir cancelación (efecto)', 'PUT', '/api/orders/{{orderId}}/cancel', {
      header: authAna(),
      test: `
const body = pm.response.json();
pm.test('CAN-02 status 200', function () { pm.response.to.have.status(200); });
pm.test('CAN-02 no altera otra vez', function () {
  pm.expect(body.repeated).to.eql(true);
  pm.expect(body.order.status).to.eql('cancelled');
  pm.expect(body.order.totalCents).to.eql(3500);
});
pm.sendRequest({
  url: pm.environment.get('baseUrl') + '/api/products/1',
  method: 'GET',
}, function (err, res) {
  pm.test('CAN-02 stock sigue en 20', function () {
    pm.expect(err).to.eql(null);
    pm.expect(res.json().stock).to.eql(20);
  });
});
`,
    }),
    req('[SCH-01] Esquema de éxito OpenAPI', 'GET', '/api/orders/{{orderId}}', {
      header: authAna(),
      test: `
const body = pm.response.json();
pm.test('SCH-01 status 200', function () { pm.response.to.have.status(200); });
pm.test('SCH-01 tipos del Order', function () {
  pm.expect(body.id).to.be.a('number');
  pm.expect(body.userId).to.be.a('number');
  pm.expect(body.code).to.be.a('string');
  pm.expect(body.totalCents).to.be.a('number');
  pm.expect(body.status).to.be.oneOf(['confirmed', 'cancelled']);
  pm.expect(body.items).to.be.an('array').that.is.not.empty;
  pm.expect(body.items[0].quantity).to.be.a('number');
});
`,
    }),
    req('[SCH-02] Esquema de error OpenAPI', 'POST', '/api/auth/login', {
      body: JSON.stringify({ email: 'ana@cafeteria.test', password: 'nope' }, null, 2),
      test: `
const body = pm.response.json();
pm.test('SCH-02 status 401', function () { pm.response.to.have.status(401); });
pm.test('SCH-02 Error required fields', function () {
  pm.expect(Object.keys(body).sort()).to.eql(['code', 'error']);
  pm.expect(body.error).to.be.a('string');
  pm.expect(body.code).to.be.a('string');
});
`,
    }),
  ],
};

const out = path.join(__dirname, '..', 'postman', 'cafeteria.postman_collection.json');
fs.writeFileSync(out, JSON.stringify(collection, null, 2));
console.log('colección escrita', out, 'requests', collection.item.length);
