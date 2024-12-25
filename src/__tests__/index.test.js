const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Mock external modules
jest.mock('express', () => {
  const mockExpress = jest.fn(() => ({
    listen: jest.fn(),
    get: jest.fn(),
    use: jest.fn()
  }));
  mockExpress.static = jest.fn();
  return mockExpress;
});

jest.mock('fs', () => ({
  readdirSync: jest.fn(),
  statSync: jest.fn()
}));

describe('Server Tests', () => {
  let app;
  
  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
  });

  describe('tryPort', () => {
    it('should resolve with server and port when port is available', async () => {
      const mockServer = {
        on: jest.fn().mockImplementation(function(event, cb) {
          if (event === 'listening') cb();
          return this;
        })
      };
      app.listen.mockReturnValue(mockServer);
      
      const { tryPort } = require('../index');
      const result = await tryPort(3000);
      
      expect(result.port).toBe(3000);
      expect(result.server).toBeDefined();
    });

    it('should increment port on EADDRINUSE error', async () => {
      const mockServer = {
        on: jest.fn().mockImplementation(function(event, cb) {
          if (event === 'error') cb({ code: 'EADDRINUSE' });
          return this;
        })
      };
      app.listen.mockReturnValue(mockServer);
      
      const { tryPort } = require('../index');
      const result = await tryPort(3000);
      
      expect(result.port).toBe(3001);
    });
  });

  describe('API Endpoints', () => {
    it('should return file listing for /api/files', async () => {
      const mockFiles = ['file1.txt', 'dir1'];
      fs.readdirSync.mockReturnValue(mockFiles);
      fs.statSync.mockImplementation((path) => ({
        isDirectory: () => path.includes('dir1'),
        size: 1024
      }));

      const response = await request(app)
        .get('/api/files')
        .query({ path: 'test-dir' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('isDirectory');
    });

    it('should handle errors in file listing', async () => {
      fs.readdirSync.mockImplementation(() => {
        throw new Error('Access denied');
      });

      const response = await request(app)
        .get('/api/files')
        .query({ path: 'invalid-dir' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Static Files', () => {
    it('should serve index.html for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');
      expect(response.status).toBe(200);
    });
  });
});
