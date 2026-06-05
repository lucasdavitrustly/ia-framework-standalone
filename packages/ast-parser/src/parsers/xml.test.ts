import { describe, it, expect } from 'vitest';
import { parseXml } from './xml.js';

/**
 * T047: Tests for XML chunker.
 * Given Spring config XML with bean definitions,
 * each major element (bean, import) is a chunk.
 */
describe('parseXml', () => {
  const filePath = '/repo/applicationContext.xml';
  const relativePath = 'src/main/resources/applicationContext.xml';

  it('produces a config-block chunk for each bean definition', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans">
  <bean id="paymentService" class="com.example.PaymentServiceImpl">
    <property name="repository" ref="paymentRepository"/>
  </bean>
  <bean id="paymentRepository" class="com.example.JdbcPaymentRepository">
    <constructor-arg ref="dataSource"/>
  </bean>
</beans>`;

    const chunks = parseXml(content, filePath, relativePath);
    const beanChunks = chunks.filter((c) => c.name?.startsWith('bean:'));
    expect(beanChunks.length).toBeGreaterThanOrEqual(2);
  });

  it('produces chunks for import elements', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans">
  <import resource="classpath:security-context.xml"/>
  <import resource="classpath:persistence-context.xml"/>
</beans>`;

    const chunks = parseXml(content, filePath, relativePath);
    const importChunks = chunks.filter((c) => c.name?.startsWith('import:'));
    expect(importChunks.length).toBeGreaterThanOrEqual(2);
  });

  it('assigns language "xml" to all chunks', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<beans>
  <bean id="foo" class="com.example.Foo"/>
</beans>`;

    const chunks = parseXml(content, filePath, relativePath);
    for (const chunk of chunks) {
      expect(chunk.language).toBe('xml');
    }
  });

  it('returns a module chunk for empty XML content', () => {
    const chunks = parseXml('', filePath, relativePath);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkType).toBe('module');
  });

  it('returns a module chunk for XML with no bean/import elements', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <property name="timeout" value="30"/>
</configuration>`;

    const chunks = parseXml(content, filePath, relativePath);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkType).toBe('module');
  });

  it('assigns correct filePath, relativePath and line numbers', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<beans>
  <bean id="svc" class="com.example.Service"/>
</beans>`;

    const chunks = parseXml(content, filePath, relativePath);
    for (const chunk of chunks) {
      expect(chunk.filePath).toBe(filePath);
      expect(chunk.relativePath).toBe(relativePath);
      expect(chunk.startLine).toBeGreaterThanOrEqual(1);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    }
  });

  it('handles pom.xml with dependency elements', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
    </dependency>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
    </dependency>
  </dependencies>
</project>`;

    const chunks = parseXml(content, filePath, relativePath);
    // pom.xml dependencies are chunked at the dependency level
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('assigns chunk indices correctly', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<beans>
  <bean id="a" class="A"/>
  <bean id="b" class="B"/>
</beans>`;

    const chunks = parseXml(content, filePath, relativePath);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
      expect(c.totalChunks).toBe(chunks.length);
    });
  });
});
