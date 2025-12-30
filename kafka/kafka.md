## [Q1] Why Pub/Sub is kinda tricky

So I was looking at Pub/Sub (like Redis), and it reminds me of a **car radio**.

If I'm driving and the music is playing, I hear it. But if I drive into a tunnel or turn off the car, I miss the song. When I come back, I can't say "hey, play that part again." It's just gone.

Here is why that can be bad:
1.  **If you aren't there, you miss it:** If my app crashes for a second, the message is lost forever.
2.  **No replay:** You can't rewind. Once it's sent, it's history.
3.  **Too much data:** If the sender talks way too fast, the receiver might crash trying to keep up.
4.  **Did it arrive?** You usually don't know for sure if the other side got the message. It's just "hope for the best."

## [Q2] Message Queues vs Message Streams

I try to think of them like this:

**Message Queues (RabbitMQ) = A To-Do List**
- It's like writing a chore on a sticky note.
- Someone grabs the note, does the chore, and **throws the note away**.
- **The Point:** It's for tasks. Once you do it, you delete it.

**Message Streams (Kafka) = A Diary**
- It's like writing in a book with a pen.
- Even after I read page 1, page 1 is still there.
- My friend can read page 1 tomorrow. I can read it again next week.
- **The Point:** The messages stay there. You can look at the history later.

## [Q3] Is Apache Kafka good?

**Why it's cool (Pros):**
- **Super Fast:** It can move millions of messages in a second. Crazy.
- **Scales Up:** If you need more space, you just add more computers.
- **Doesn't Lose Stuff:** It saves everything to the hard drive, so even if the power cuts, your data is okay.
- **Separate:** The person sending data doesn't need to know who is reading it.

**Why it's annoying (Cons):**
- **Hard to learn:** Setting it up was a headache. There are so many moving parts (Zookeeper, brokers...).
- **Too much for small stuff:** If you just have a simple contact form, Kafka is overkill. It's like driving a tank to the grocery store.
- **Confusing settings:** You have to tune a lot of settings to make it fast.

## [Q8] Consumer vs Consumer Group

Okay, think of a **Pizza Shop**.

- **Consumer:** This is just **one delivery guy**. If 100 pizzas are ready, this poor guy has to deliver all of them alone. He will probably be late.

- **Consumer Group:** This is the **whole squad of drivers**.
    - If there are 100 pizzas and 4 drivers, they split the work! Each one takes 25.
    - If one driver's car breaks down, the other 3 just take his pizzas.
    - **Important:** Different groups are totally separate. The "Delivery Squad" delivers pizzas. The "Manager Squad" (a different group) might count the pizzas for money. They don't interfere with each other.

## Hands-on: Trying out Kafka Commands

I wanted to actually see this work, so I ran some commands in the Docker container. Here is what I did.

docker-compose.yml file is in kafka-local folder 

![Kafka CLI Terminal Output](./Screenshot%202025-12-29%20at%2011.55.44%E2%80%AFPM.png)

```bash
# 1. Go inside the container
# This lets me type commands inside the Kafka server
docker exec -it kafka bash

# 2. Make a Topic
# I made a new topic called 'my_first_kafka_topic'
kafka-topics --create \
  --topic my_first_kafka_topic \
  --bootstrap-server localhost:9092 \
  --partitions 1 \
  --replication-factor 1

# 3. Check if it worked
kafka-topics --list --bootstrap-server localhost:9092

# 4. Be the Producer (The Writer)
# I started this, typed some messages, and hit Enter.
kafka-console-producer \
  --topic my_first_kafka_topic \
  --bootstrap-server localhost:9092
> hello kafka
> anyone there?

# 5. Be the Consumer (The Reader)
# I opened a new window for this.
# I used --from-beginning so I could see the stuff I typed before!
kafka-console-consumer \
  --topic my_first_kafka_topic \
  --from-beginning \
  --bootstrap-server localhost:9092
```

## [Q9 BONUS] Speed Test: BullMQ vs RabbitMQ vs Kafka

I was curious which one is faster, so I tried to break them.
I sent **1 million messages** to each one to see what would happen.

### My Setup
I just used my MacBook and Docker.
- **BullMQ:** Using Redis.
- **RabbitMQ:** Normal settings.
- **Kafka:** Just one broker.

### The Scores (Events per Second)

| How many messages? | BullMQ (Redis) | RabbitMQ | Kafka |
| :--- | :--- | :--- | :--- |
| **10k** | ~30k | ~39k | ~22k (Started slow) |
| **100k** | ~42k | ~71k | ~94k |
| **1M** | ~43k | ~72k | **~129k (Winner!)** |

### What I noticed

1.  **Kafka is a Beast**:
    It started kind of slow (22k) when I only sent a few messages. But when I sent 1 million, it went super fast (**129k/s**). It seems to like big jobs.

2.  **RabbitMQ is Reliable**:
    It was very steady. It did about ~72k/s no matter what. It's fast enough for most things, but not as crazy fast as Kafka.

3.  **BullMQ was the "slowest"**:
    It did about ~43k/s. But to be fair, it does a lot more work (handling job retries and stuff in Redis). So it's not bad, just different.

**My Take:**
If you need to move a TON of data, use **Kafka**. If you need to manage complex jobs, **BullMQ** is great. **RabbitMQ** is a good middle ground.
