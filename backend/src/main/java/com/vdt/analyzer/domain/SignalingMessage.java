package com.vdt.analyzer.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "signaling_message")
public class SignalingMessage {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id")
    private Long sessionId;

    private Instant ts;
    private String direction;
    private String protocol;
    private String channel;

    @Column(name = "message_name")
    private String messageName;

    private String body;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public Instant getTs() { return ts; }
    public void setTs(Instant ts) { this.ts = ts; }
    public String getDirection() { return direction; }
    public void setDirection(String direction) { this.direction = direction; }
    public String getProtocol() { return protocol; }
    public void setProtocol(String protocol) { this.protocol = protocol; }
    public String getChannel() { return channel; }
    public void setChannel(String channel) { this.channel = channel; }
    public String getMessageName() { return messageName; }
    public void setMessageName(String messageName) { this.messageName = messageName; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
}
