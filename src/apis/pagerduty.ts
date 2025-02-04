import fetch from 'node-fetch';
import type { RequestInit, Response } from 'node-fetch';

import { getAuthToken } from '../auth/auth';

import {
    PagerDutyServiceResponse,
    PagerDutyServicesResponse,
    PagerDutyEscalationPolicy,
    PagerDutyEscalationPoliciesResponse,
    PagerDutyAbilitiesResponse,
    PagerDutyOnCallsResponse,
    PagerDutyUser,
    PagerDutyService,
    PagerDutyChangeEventsResponse,
    PagerDutyChangeEvent,
    PagerDutyIncident,
    PagerDutyIncidentsResponse,
    PagerDutyServiceStandards,
    PagerDutyServiceMetrics,
    HttpError,
    PagerDutyServicesAPIResponse
} from '@pagerduty/backstage-plugin-common';

import { DateTime } from 'luxon';

let apiBaseUrl = 'https://api.pagerduty.com';
export function setAPIBaseUrl(url: string): void {
    apiBaseUrl = url;
}

// Supporting router

async function getEscalationPolicies(offset: number, limit: number): Promise<[Boolean, PagerDutyEscalationPolicy[]]> {
    let response: Response;
    const params = `total=true&sort_by=name&offset=${offset}&limit=${limit}`;
    const options: RequestInit = {
        method: 'GET',
        headers: {
            Authorization: await getAuthToken(),
            'Accept': 'application/vnd.pagerduty+json;version=2',
            'Content-Type': 'application/json',
        },
    };
    const baseUrl = `${apiBaseUrl}/escalation_policies`;

    try {
        response = await fetch(`${baseUrl}?${params}`, options);
    } catch (error) {
        throw new Error(`Failed to retrieve escalation policies: ${error}`);
    }

    switch (response.status) {
        case 400:
            throw new HttpError("Failed to list escalation policies. Caller provided invalid arguments.", 400);
        case 401:
            throw new HttpError("Failed to list escalation policies. Caller did not supply credentials or did not provide the correct credentials.", 401);
        case 403:
            throw new HttpError("Failed to list escalation policies. Caller is not authorized to view the requested resource.", 403);
        case 429:
            throw new HttpError("Failed to list escalation policies. Rate limit exceeded.", 429);
        default: // 200
            break;
    }

    let result: PagerDutyEscalationPoliciesResponse;
    try {
        result = await response.json() as PagerDutyEscalationPoliciesResponse;

        return [result.more ?? false, result.escalation_policies];

    } catch (error) {
        throw new HttpError(`Failed to parse escalation policy information: ${error}`, 500);
    }
}

export async function getAllEscalationPolicies(offset: number = 0): Promise<PagerDutyEscalationPolicy[]> {
    const limit = 50;

    try {
        const res = await getEscalationPolicies(offset, limit);
        const results = res[1];

        // if more results exist
        if (res[0]) {
            return results.concat((await getAllEscalationPolicies(offset + limit)));
        }

        return results;
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        else {
            throw new HttpError(`${error}`, 500);
        }
    }
}

export async function isEventNoiseReductionEnabled(): Promise<boolean> {
    let response: Response;
    const baseUrl = 'https://api.pagerduty.com';
    const options: RequestInit = {
        method: 'GET',
        headers: {
            Authorization: await getAuthToken(),
            'Accept': 'application/vnd.pagerduty+json;version=2',
            'Content-Type': 'application/json',
        },
    };

    try {
        response = await fetch(`${baseUrl}/abilities`, options);
    } catch (error) {
        throw new Error(`Failed to read abilities: ${error}`);
    }

    switch (response.status) {
        case 401:
            throw new Error(`Failed to read abilities. Caller did not supply credentials or did not provide the correct credentials.`);
        case 403:
            throw new Error(`Failed to read abilities. Caller is not authorized to view the requested resource.`);
        case 429:
            throw new Error(`Failed to read abilities. Rate limit exceeded.`);
        default: // 200
            break;
    }

    let result: PagerDutyAbilitiesResponse;
    try {
        result = await response.json() as PagerDutyAbilitiesResponse;

        if (result.abilities.includes('preview_intelligent_alert_grouping')
            && result.abilities.includes('time_based_alert_grouping')) {
            return true;
        }

        return false;

    } catch (error) {
        throw new Error(`Failed to parse abilities information: ${error}`);
    }
}

export async function getOncallUsers(escalationPolicy: string): Promise<PagerDutyUser[]> {
    let response: Response;
    const params = `time_zone=UTC&include[]=users&escalation_policy_ids[]=${escalationPolicy}`;
    const options: RequestInit = {
        method: 'GET',
        headers: {
            Authorization: await getAuthToken(),
            'Accept': 'application/vnd.pagerduty+json;version=2',
            'Content-Type': 'application/json',
        },
    };
    const baseUrl = `${apiBaseUrl}/oncalls`;

    try {
        response = await fetch(`${baseUrl}?${params}`, options);
    } catch (error) {
        throw new Error(`Failed to retrieve oncalls: ${error}`);
    }

    switch (response.status) {
        case 400:
            throw new HttpError("Failed to list oncalls. Caller provided invalid arguments.", 400);
        case 401:
            throw new HttpError("Failed to list oncalls. Caller did not supply credentials or did not provide the correct credentials.", 401);
        case 403:
            throw new HttpError("Failed to list oncalls. Caller is not authorized to view the requested resource.", 403);
        case 429:
            throw new HttpError("Failed to list oncalls. Rate limit exceeded.", 429);
        default: // 200
            break;
    }

    let result: PagerDutyOnCallsResponse;
    let usersItem: PagerDutyUser[];
    try {
        result = await response.json() as PagerDutyOnCallsResponse;

        if (result.oncalls.length !== 0) {
            const oncallsSorted = [...result.oncalls].sort((a, b) => {
                return a.escalation_level - b.escalation_level;
            });

            const oncallsFiltered = oncallsSorted.filter((oncall) => {
                return oncall.escalation_level === oncallsSorted[0].escalation_level;
            });

            usersItem = [...oncallsFiltered]
                .sort((a, b) => a.user.name > b.user.name ? 1 : -1)
                .map((oncall) => oncall.user);


            // remove duplicates from usersItem
            const uniqueUsers = new Map();
            usersItem.forEach((user) => {
                uniqueUsers.set(user.id, user);
            });

            usersItem.length = 0;
            uniqueUsers.forEach((user) => {
                usersItem.push(user);
            });

            return usersItem;
        }

        return [];

    } catch (error) {
        throw new HttpError(`Failed to parse oncall information: ${error}`, 500);
    }
}

export async function getServiceById(serviceId: string): Promise<PagerDutyService> {
    let response: Response;
    const params = `time_zone=UTC&include[]=integrations&include[]=escalation_policies`;
    const options: RequestInit = {
        method: 'GET',
        headers: {
            Authorization: await getAuthToken(),
            'Accept': 'application/vnd.pagerduty+json;version=2',
            'Content-Type': 'application/json',
        },
    };
    const baseUrl = `${apiBaseUrl}/services`;

    try {
        response = await fetch(`${baseUrl}/${serviceId}?${params}`, options);
    } catch (error) {
        throw new Error(`Failed to retrieve service: ${error}`);
    }

    switch (response.status) {
        case 400:
            throw new HttpError("Failed to get service. Caller provided invalid arguments.", 400);
        case 401:
            throw new HttpError("Failed to get service. Caller did not supply credentials or did not provide the correct credentials.", 401);
        case 403:
            throw new HttpError("Failed to get service. Caller is not authorized to view the requested resource.", 403);
        case 404:
            throw new HttpError("Failed to get service. The requested resource was not found.", 404);
        default: // 200
            break;
    }

    let result: PagerDutyServiceResponse;
    try {
        result = await response.json() as PagerDutyServiceResponse;

        return result.service;
    } catch (error) {
        throw new HttpError(`Failed to parse service information: ${error}`, 500);
    }
}

export async function getServiceByIntegrationKey(integrationKey: string): Promise<PagerDutyService> {
    let response: Response;
    const params = `query=${integrationKey}&time_zone=UTC&include[]=integrations&include[]=escalation_policies`;
    const options: RequestInit = {
        method: 'GET',
        headers: {
            Authorization: await getAuthToken(),
            'Accept': 'application/vnd.pagerduty+json;version=2',
            'Content-Type': 'application/json',
        },
    };
    const baseUrl = `${apiBaseUrl}/services`;

    try {
        response = await fetch(`${baseUrl}?${params}`, options);
    } catch (error) {
        throw new Error(`Failed to retrieve service: ${error}`);
    }

    switch (response.status) {
        case 400:
            throw new HttpError("Failed to get service. Caller provided invalid arguments.", 400);
        case 401:
            throw new HttpError("Failed to get service. Caller did not supply credentials or did not provide the correct credentials.", 401);
        case 403:
            throw new HttpError("Failed to get service. Caller is not authorized to view the requested resource.", 403);
        case 404:
            throw new HttpError("Failed to get service. The requested resource was not found.", 404);
        default: // 200
            break;
    }

    let result: PagerDutyServicesResponse;
    try {
        result = await response.json() as PagerDutyServicesResponse;
    } catch (error) {
        throw new HttpError(`Failed to parse service information: ${error}`, 500);
    }

    if (result.services.length === 0) {
        throw new HttpError(`Failed to get service. The requested resource was not found.`, 404);
    }

    return result.services[0];
}

export async function getAllServices(): Promise<PagerDutyService[]> {
    let response: Response;
    const params = `time_zone=UTC&include[]=integrations&include[]=escalation_policies&include[]=teams&total=true`;
    const options: RequestInit = {
        method: 'GET',
        headers: {
            Authorization: await getAuthToken(),
            'Accept': 'application/vnd.pagerduty+json;version=2',
            'Content-Type': 'application/json',
        },
    };
    const baseUrl = `${apiBaseUrl}/services`;

    const allServices: PagerDutyService[] = [];
    let offset = 0;
    const limit = 50;
    let result: PagerDutyServicesAPIResponse;

    try {
        do {
            const paginatedUrl = `${baseUrl}?${params}&offset=${offset}&limit=${limit}`;
            response = await fetch(paginatedUrl, options);

            switch (response.status) {
                case 400:
                    throw new HttpError("Failed to get services. Caller provided invalid arguments.", 400);
                case 401:
                    throw new HttpError("Failed to get services. Caller did not supply credentials or did not provide the correct credentials.", 401);
                case 403:
                    throw new HttpError("Failed to get services. Caller is not authorized to view the requested resource.", 403);
                default: // 200
                    break;
            }

            result = await response.json() as PagerDutyServicesAPIResponse;
            
            allServices.push(...result.services);

            offset += limit;
        } while (offset < result.total!);
    } catch (error) {
        throw error;
    }

    return allServices;
}

export async function getChangeEvents(serviceId: string): Promise<PagerDutyChangeEvent[]> {
    let response: Response;
    const params = `limit=5&time_zone=UTC&sort_by=timestamp`;
    const options: RequestInit = {
        method: 'GET',
        headers: {
            Authorization: await getAuthToken(),
            'Accept': 'application/vnd.pagerduty+json;version=2',
            'Content-Type': 'application/json',
        },
    };
    const baseUrl = `${apiBaseUrl}/services`;

    try {
        response = await fetch(`${baseUrl}/${serviceId}/change_events?${params}`, options);
    } catch (error) {
        throw new Error(`Failed to retrieve change events for service: ${error}`);
    }

    switch (response.status) {
        case 400:
            throw new HttpError("Failed to get change events for service. Caller provided invalid arguments.", 400);
        case 401:
            throw new HttpError("Failed to get change events for service. Caller did not supply credentials or did not provide the correct credentials.", 401);
        case 403:
            throw new HttpError("Failed to get change events for service. Caller is not authorized to view the requested resource.", 403);
        case 404:
            throw new HttpError("Failed to get change events for service. The requested resource was not found.", 404);
        default: // 200
            break;
    }

    let result: PagerDutyChangeEventsResponse;
    try {
        result = await response.json() as PagerDutyChangeEventsResponse;

        return result.change_events;
    } catch (error) {
        throw new HttpError(`Failed to parse change events information: ${error}`, 500);
    }
}

export async function getIncidents(serviceId: string): Promise<PagerDutyIncident[]> {
    let response: Response;
    const params = `time_zone=UTC&sort_by=created_at&statuses[]=triggered&statuses[]=acknowledged&service_ids[]=${serviceId}`;

    const options: RequestInit = {
        method: 'GET',
        headers: {
            Authorization: await getAuthToken(),
            'Accept': 'application/vnd.pagerduty+json;version=2',
            'Content-Type': 'application/json',
        },
    };
    const baseUrl = `${apiBaseUrl}/incidents`;

    try {
        response = await fetch(`${baseUrl}?${params}`, options);
    } catch (error) {
        throw new Error(`Failed to retrieve incidents for service: ${error}`);
    }

    switch (response.status) {
        case 400:
            throw new HttpError("Failed to get incidents for service. Caller provided invalid arguments.", 400);
        case 401:
            throw new HttpError("Failed to get incidents for service. Caller did not supply credentials or did not provide the correct credentials.", 401);
        case 402:
            throw new HttpError("Failed to get incidents for service. Account does not have the abilities to perform the action. Please review the response for the required abilities.", 402);
        case 403:
            throw new HttpError("Failed to get incidents for service. Caller is not authorized to view the requested resource.", 403);
        case 429:
            throw new HttpError("Failed to get incidents for service. Too many requests have been made, the rate limit has been reached.", 429);
        default: // 200
            break;
    }

    let result: PagerDutyIncidentsResponse;
    try {
        result = await response.json() as PagerDutyIncidentsResponse;

        return result.incidents;
    } catch (error) {
        throw new HttpError(`Failed to parse incidents information: ${error}`, 500);
    }
}

export async function getServiceStandards(serviceId: string): Promise<PagerDutyServiceStandards> {
    let response: Response;

    const options: RequestInit = {
        method: 'GET',
        headers: {
            Authorization: await getAuthToken(),
            'Accept': 'application/vnd.pagerduty+json;version=2',
            'Content-Type': 'application/json',
        },
    };
    const baseUrl = `${apiBaseUrl}/standards/scores/technical_services/${serviceId}`;

    try {
        response = await fetch(baseUrl, options);
    } catch (error) {
        throw new Error(`Failed to retrieve service standards for service: ${error}`);
    }

    switch (response.status) {
        case 401:
            throw new HttpError("Failed to get service standards for service. Caller did not supply credentials or did not provide the correct credentials.", 401);
        case 403:
            throw new HttpError("Failed to get service standards for service. Caller is not authorized to view the requested resource.", 403);
        case 429:
            throw new HttpError("Failed to get service standards for service. Too many requests have been made, the rate limit has been reached.", 429);
        default: // 200
            break;
    }

    try {
        const result = await response.json();
        return result;
    } catch (error) {
        throw new HttpError(`Failed to parse service standards information: ${error}`, 500);
    }
}

export async function getServiceMetrics(serviceId: string): Promise<PagerDutyServiceMetrics[]> {
    let response: Response;
    
    const endDate = DateTime.now();
    const startDate = endDate.minus({ days: 30 });
    const body = JSON.stringify({
        filters: {
            created_at_start: startDate.toISO(),
            created_at_end: endDate.toISO(),
            service_ids: [
                serviceId
            ]
        }
    });

    const options: RequestInit = {
        method: 'POST',
        headers: {
            Authorization: await getAuthToken(),
            'Accept': 'application/vnd.pagerduty+json;version=2',
            'Content-Type': 'application/json',
        },
        body: body
    };
    const baseUrl = `${apiBaseUrl}/analytics/metrics/incidents/services`;

    try {
        response = await fetch(baseUrl, options);
    } catch (error) {
        throw new Error(`Failed to retrieve service metrics for service: ${error}`);
    }
    
    switch (response.status) {
        case 400:
            throw new HttpError("Failed to get service metrics for service. Caller provided invalid arguments. Please review the response for error details. Retrying with the same arguments will not work.", 400);
        case 429:
            throw new HttpError("Failed to get service metrics for service. Too many requests have been made, the rate limit has been reached.", 429);
        default: // 200
            break;
    }

    try {
        const result = await response.json();

        return result.data;
    } catch (error) {
        throw new HttpError(`Failed to parse service metrics information: ${error}`, 500);
    }
}

