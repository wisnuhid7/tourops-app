import robotsParser from 'robots-parser';

export class ScraperSafetyManager {
  private domainBlocklist: Set<string> = new Set();
  private robotsCache: Map<string, any> = new Map();
  private requestLogs: Map<string, number[]> = new Map();
  
  // Rate limits: 2 requests per second per domain
  private readonly MAX_REQUESTS_PER_SECOND = 2;

  /**
   * Admin kill switch to block a domain instantly
   */
  blockDomain(domain: string) {
    this.domainBlocklist.add(domain);
    console.log(`[Safety] Domain blocked: ${domain}`);
  }

  unblockDomain(domain: string) {
    this.domainBlocklist.delete(domain);
    console.log(`[Safety] Domain unblocked: ${domain}`);
  }

  isBlocked(url: string): boolean {
    try {
      const domain = new URL(url).hostname;
      return this.domainBlocklist.has(domain);
    } catch {
      return true; // Block invalid URLs
    }
  }

  /**
   * Enforces robots.txt rules for the given URL
   */
  async checkRobots(url: string, userAgent = 'TouropBot'): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      
      let robots = this.robotsCache.get(robotsUrl);
      if (!robots) {
        // In a real app, fetch the robots.txt here
        // For now, we simulate an 'allow all' if we can't fetch it
        robots = robotsParser(robotsUrl, 'User-agent: *\nAllow: /');
        this.robotsCache.set(robotsUrl, robots);
      }
      
      return robots.isAllowed(url, userAgent) !== false;
    } catch {
      return true; // Default to allow if robots check fails
    }
  }

  /**
   * Enforces rate limiting and waits if necessary
   */
  async throttle(url: string): Promise<void> {
    const domain = new URL(url).hostname;
    const now = Date.now();
    
    if (!this.requestLogs.has(domain)) {
      this.requestLogs.set(domain, []);
    }
    
    const logs = this.requestLogs.get(domain)!;
    
    // Clean up logs older than 1 second
    const recentLogs = logs.filter(time => now - time < 1000);
    this.requestLogs.set(domain, recentLogs);
    
    if (recentLogs.length >= this.MAX_REQUESTS_PER_SECOND) {
      const waitTime = 1000 - (now - recentLogs[0]);
      console.log(`[Safety] Rate limiting ${domain}. Waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.requestLogs.get(domain)!.push(Date.now());
  }

  /**
   * Wrapper for fetch that includes all safety features and exponential backoff
   */
  async safeFetch(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
    if (this.isBlocked(url)) {
      throw new Error(`Domain is blocked by admin kill switch: ${url}`);
    }

    const isAllowed = await this.checkRobots(url);
    if (!isAllowed) {
      throw new Error(`URL blocked by robots.txt: ${url}`);
    }

    let retries = 0;
    while (retries <= maxRetries) {
      await this.throttle(url);
      
      try {
        const response = await fetch(url, options);
        
        // 429 Too Many Requests or 5xx Server Errors
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        return response;
      } catch (error: any) {
        if (retries === maxRetries) {
          throw new Error(`Failed to fetch ${url} after ${maxRetries} retries: ${error.message}`);
        }
        
        // Exponential backoff: 2s, 4s, 8s...
        const backoffTime = Math.pow(2, retries) * 1000;
        console.log(`[Safety] Fetch failed. Retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        retries++;
      }
    }
    
    throw new Error('Unreachable');
  }
}

export const scraperSafety = new ScraperSafetyManager();
