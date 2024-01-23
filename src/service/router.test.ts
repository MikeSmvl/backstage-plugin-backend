import { getVoidLogger } from '@backstage/backend-common';
import { ConfigReader } from '@backstage/config';
import express from 'express';
import request from 'supertest';

import { createRouter } from './router';
import { PagerDutyEscalationPolicy, PagerDutyUser } from '@pagerduty/backstage-plugin-common';

describe('createRouter', () => {
  let app: express.Express;

  beforeAll(async () => {
    const router = await createRouter(
      {
        logger: getVoidLogger(),
        config: new ConfigReader({
          app: {
            baseUrl: 'https://example.com/extra-path',
          },
          pagerDuty: {
            apiToken: `${process.env.PAGERDUTY_TOKEN}`,
          },
        }),
      }
    );
    app = express().use(router);
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });  

  describe('GET /health', () => {
    it('returns ok', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toEqual(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /escalation_policies', () => {
    it('returns ok', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          status: 200,
          json: () => Promise.resolve({
            escalation_policies: [
              {
                id: "12345",
                name: "Test Escalation Policy",
                type: "escalation_policy",
                summary: "Test Escalation Policy",
                self: "https://api.pagerduty.com/escalation_policies/12345",
                html_url: "https://example.pagerduty.com/escalation_policies/12345",
              }
            ]
          })
        })
      ) as jest.Mock;

      const expectedStatusCode = 200;
      const expectedResponse = [
        {
          label: "Test Escalation Policy",
          value: "12345",
        }
      ];

      const response = await request(app).get('/escalation_policies');

      const policies: PagerDutyEscalationPolicy[] = JSON.parse(response.text);

      expect(response.status).toEqual(expectedStatusCode);
      expect(response.body).toEqual(expectedResponse);
      expect(policies.length).toEqual(1);
    });

    it('returns unauthorized', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          status: 401
        })
      ) as jest.Mock;

      const expectedStatusCode = 401;
      const expectedErrorMessage = "Failed to list escalation policies. Caller did not supply credentials or did not provide the correct credentials.";

      const response = await request(app).get('/escalation_policies');

      expect(response.status).toEqual(expectedStatusCode);
      expect(response.text).toMatch(expectedErrorMessage);
    });
    
    it('returns empty list when no escalation policies exist', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          status: 200,
          json: () => Promise.resolve({
            escalation_policies: []
          })
        })
      ) as jest.Mock;

      const expectedStatusCode = 200;
      const expectedResponse: PagerDutyEscalationPolicy[] = [];

      const response = await request(app).get('/escalation_policies');

      const policies: PagerDutyEscalationPolicy[] = JSON.parse(response.text);

      expect(response.status).toEqual(expectedStatusCode);
      expect(response.body).toEqual(expectedResponse);
      expect(policies.length).toEqual(0);
    });
  });

  describe('GET /oncall-users', () => {
    it('returns ok', async () => {
      const escalationPolicyId = "12345";
      const expectedStatusCode = 200;
      const expectedResponse = [
        {
          id: "userId2",
          name: "Jane Doe",
          email: "jane.doe@email.com",
          avatar_url: "https://example.pagerduty.com/avatars/123",
          html_url: "https://example.pagerduty.com/users/123",
          summary: "Jane Doe",
        },
        {
          id: "userId1",
          name: "John Doe",
          email: "john.doe@email.com",
          avatar_url: "https://example.pagerduty.com/avatars/123",
          html_url: "https://example.pagerduty.com/users/123",
          summary: "John Doe",
        }
      ];

      global.fetch = jest.fn(() =>
        Promise.resolve({
          status: 200,
          json: () => Promise.resolve({
            "oncalls": [
              {
                "user": {
                  "id": expectedResponse[0].id,
                  "summary": expectedResponse[0].summary,
                  "name": expectedResponse[0].name,
                  "email": expectedResponse[0].email,
                  "avatar_url": expectedResponse[0].avatar_url,
                  "html_url": expectedResponse[0].html_url,
                },
                "escalation_level": 1
              },
              {
                "user": {
                  "id": expectedResponse[1].id,
                  "summary": expectedResponse[1].summary,
                  "name": expectedResponse[1].name,
                  "email": expectedResponse[1].email,
                  "avatar_url": expectedResponse[1].avatar_url,
                  "html_url": expectedResponse[1].html_url,
                },
                "escalation_level": 1
              }
            ]
          })
        })
      ) as jest.Mock;

      

      const response = await request(app).get(`/oncall-users?escalation_policy_ids[]=${escalationPolicyId}`);

      const oncallUsers: PagerDutyUser[] = JSON.parse(response.text);

      expect(response.status).toEqual(expectedStatusCode);
      expect(response.body).toEqual(expectedResponse);
      expect(oncallUsers.length).toEqual(2);
    });

    it('returns unauthorized', async () => {
      const escalationPolicyId = "12345";
      global.fetch = jest.fn(() =>
        Promise.resolve({
          status: 401
        })
      ) as jest.Mock;

      const expectedStatusCode = 401;
      const expectedErrorMessage = "Failed to list oncalls. Caller did not supply credentials or did not provide the correct credentials.";

      const response = await request(app).get(`/oncall-users?escalation_policy_ids[]=${escalationPolicyId}`);

      expect(response.status).toEqual(expectedStatusCode);
      expect(response.text).toMatch(expectedErrorMessage);
    });

    it('returns empty list when no escalation policies exist', async () => {
      const escalationPolicyId = "12345";
      global.fetch = jest.fn(() =>
        Promise.resolve({
          status: 200,
          json: () => Promise.resolve(
            {
              "oncalls": []
            }
          )
        })
      ) as jest.Mock;

      const expectedStatusCode = 200;
      const expectedResponse: PagerDutyUser[] = [];

      const response = await request(app).get(`/oncall-users?escalation_policy_ids[]=${escalationPolicyId}`);

      const oncallUsers: PagerDutyUser[] = JSON.parse(response.text);

      expect(response.status).toEqual(expectedStatusCode);
      expect(response.body).toEqual(expectedResponse);
      expect(oncallUsers.length).toEqual(0);
    });
  });
});