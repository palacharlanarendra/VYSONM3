# [Q3] Benefits of using a Retry Queue

**1. Prevents blocking**
If a message is broken (a "poison pill"), retrying it instantly blocks the worker. It's like a car breaking down in a single-lane tunnel—nobody else can get through. By moving it to a retry queue, we pull the car to the side of the road so traffic keeps moving.

**2. Saves resources**
If a service is down, retrying instantly is useless. It wastes CPU and slows everything down. A retry queue lets us wait a bit before trying again.

**What if we want to retry 2 times?**

We can add another queue called `second-retry-queue`. When a message errors out while processing from the first retry queue, we can add it to this queue.
